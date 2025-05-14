// Uniswap V3 Automated Swap Script
// Requires: npm install ethers@5.7.2 dotenv readline-sync @uniswap/v3-periphery @uniswap/v3-core bignumber.js

require("dotenv").config();
const { ethers } = require("ethers");
const readline = require("readline-sync");
const BigNumber = require("bignumber.js");

// Uniswap V3 Router addresses - change these based on the network
const ROUTER_ADDRESSES = {
  // Ethereum Mainnet
  1: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  // Goerli Testnet
  5: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  // Polygon
  137: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  // Arbitrum
  42161: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  // Optimism
  10: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  // BNB Chain - Note: Uniswap V3 is not officially on BSC, may need to use PancakeSwap router instead
  56: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", // PancakeSwap V3 Router
  // BNB Chain Testnet
  97: "0x404a458117c30fa27b952c035c4E2D12C337c61d", // PancakeSwap V3 Router on testnet
};

// WETH/WBNB/WMATIC addresses
const WRAPPED_NATIVE_TOKENS = {
  // WETH - Ethereum Mainnet
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  // WETH - Goerli Testnet
  5: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  // WMATIC - Polygon
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  // WETH - Arbitrum
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  // WETH - Optimism
  10: "0x4200000000000000000000000000000000000006",
  // WBNB - BNB Chain
  56: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  // WBNB - BNB Chain Testnet
  97: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

// ABIs
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const UNISWAP_ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];

// Connect to the Ethereum network
async function connectToEthereum() {
  // Get network from env or ask the user
  const defaultNetwork = process.env.NETWORK || "mainnet";
  const networkOptions = {
    mainnet: { name: "mainnet", chainId: 1 },
    goerli: { name: "goerli", chainId: 5 },
    sepolia: { name: "sepolia", chainId: 11155111 },
    bsc: { name: "bsc", chainId: 56 },
    "bsc-testnet": { name: "bnbt", chainId: 97 },
    polygon: { name: "polygon", chainId: 137 },
    arbitrum: { name: "arbitrum", chainId: 42161 },
    optimism: { name: "optimism", chainId: 10 },
    avalanche: { name: "avalanche", chainId: 43114 },
  };

  let network = defaultNetwork;
  if (!Object.keys(networkOptions).includes(network)) {
    network = "mainnet"; // Default to mainnet if invalid network specified
  }

  // Use values from networkOptions if available, otherwise use the string directly
  const networkConfig = networkOptions[network] || network;

  const providerUrl =
    process.env.PROVIDER_URL ||
    readline.question("Enter your provider URL (Infura, Alchemy, BSC, etc.): ");

  console.log(`Attempting to connect to network: ${network}`);
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);

  // Detect the actual network and verify it matches the expected network
  try {
    const detectedNetwork = await provider.getNetwork();
    console.log(
      `Detected network: ${detectedNetwork.name} (Chain ID: ${detectedNetwork.chainId})`
    );

    // If using a known network from our options, verify chain ID
    if (
      networkOptions[network] &&
      networkOptions[network].chainId !== detectedNetwork.chainId
    ) {
      console.warn(
        `⚠️ WARNING: Expected chain ID ${networkOptions[network].chainId} (${network}), but connected to chain ID ${detectedNetwork.chainId} (${detectedNetwork.name})`
      );

      const proceed = readline.keyInYN(
        "Network mismatch detected. Do you want to proceed anyway?"
      );
      if (!proceed) {
        throw new Error("User aborted due to network mismatch");
      }
    }

    return provider;
  } catch (error) {
    if (error.message === "User aborted due to network mismatch") {
      throw error;
    }
    console.error(`Failed to detect network: ${error.message}`);
    throw new Error(`Could not connect to network: ${error.message}`);
  }
}

// Get token details
async function getTokenDetails(provider, tokenAddress) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const decimals = await token.decimals();
  const symbol = await token.symbol();

  return { token, decimals, symbol };
}

// Generate new wallets
async function generateWallets(count) {
  const wallets = [];

  for (let i = 0; i < count; i++) {
    const wallet = ethers.Wallet.createRandom();
    wallets.push(wallet);
    console.log(`Generated wallet ${i + 1}: ${wallet.address}`);
  }

  return wallets;
}

// Fund generated wallets from main wallet
async function fundWallets(
  provider,
  mainWallet,
  generatedWallets,
  tokenA,
  tokenADetails,
  fundAmount
) {
  console.log(
    `\nFunding ${
      generatedWallets.length
    } wallets with ${ethers.utils.formatUnits(
      fundAmount,
      tokenADetails.decimals
    )} ${tokenADetails.symbol}...`
  );

  for (const wallet of generatedWallets) {
    // First send some ETH for gas
    const gasEth = ethers.utils.parseEther("0.05"); // 0.05 ETH for gas

    const ethTx = await mainWallet.sendTransaction({
      to: wallet.address,
      value: gasEth,
    });

    await ethTx.wait();
    console.log(
      `Sent ${ethers.utils.formatEther(gasEth)} ETH to ${
        wallet.address
      } for gas`
    );

    // Send token A
    const tokenContract = tokenADetails.token.connect(mainWallet);
    const tx = await tokenContract.transfer(wallet.address, fundAmount);

    await tx.wait();
    console.log(
      `Sent ${ethers.utils.formatUnits(fundAmount, tokenADetails.decimals)} ${
        tokenADetails.symbol
      } to ${wallet.address}`
    );
  }
}

// Execute a swap on Uniswap V3 or compatible DEX
async function executeSwap(
  provider,
  wallet,
  tokenA,
  tokenB,
  amount,
  slippage,
  feeTier
) {
  // Get chain ID to determine which router to use
  const { chainId } = await provider.getNetwork();

  // Get the appropriate router address for this network
  const routerAddress = ROUTER_ADDRESSES[chainId];
  if (!routerAddress) {
    throw new Error(`No router address configured for chain ID ${chainId}`);
  }

  const tokenAContract = new ethers.Contract(tokenA.address, ERC20_ABI, wallet);
  const uniswapRouter = new ethers.Contract(
    routerAddress,
    UNISWAP_ROUTER_ABI,
    wallet
  );

  // Check token balance before approving
  const balance = await tokenAContract.balanceOf(wallet.address);
  console.log(
    `Current balance: ${ethers.utils.formatUnits(balance, tokenA.decimals)} ${
      tokenA.symbol
    }`
  );

  if (balance.lt(amount)) {
    console.error(
      `Insufficient balance! Have ${ethers.utils.formatUnits(
        balance,
        tokenA.decimals
      )} ${tokenA.symbol}, need ${ethers.utils.formatUnits(
        amount,
        tokenA.decimals
      )} ${tokenA.symbol}`
    );
    return false;
  }

  // Check if pool exists by trying to get the pool address (if using Uniswap V3 or compatible interface)
  try {
    // This is a simple way to check if the pool exists without deploying a full factory contract
    console.log(`Checking if pair exists with fee tier ${feeTier}...`);

    // Use the quoter contract if available to check if pool exists
    // This is a basic check and will be skipped if it fails
    try {
      // Different quoter addresses for different chains
      const quoterAddresses = {
        1: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6", // Ethereum Mainnet Uniswap V3 Quoter
        137: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6", // Polygon Uniswap V3 Quoter
        56: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2", // BSC PancakeSwap V3 Quoter
        97: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2", // BSC Testnet PancakeSwap V3 Quoter
      };

      if (quoterAddresses[chainId]) {
        const QUOTER_ABI = [
          "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
        ];

        const quoter = new ethers.Contract(
          quoterAddresses[chainId],
          QUOTER_ABI,
          provider
        );

        // This will throw if the pool doesn't exist
        await quoter.callStatic.quoteExactInputSingle(
          tokenA.address,
          tokenB.address,
          feeTier,
          ethers.utils.parseUnits("1", tokenA.decimals),
          0
        );

        console.log(
          `Pool exists for ${tokenA.symbol}/${tokenB.symbol} with fee tier ${feeTier}`
        );
      }
    } catch (error) {
      console.warn(
        `⚠️ Could not verify if pool exists. This might cause the swap to fail. Error: ${error.message}`
      );

      // Suggest alternative fee tiers
      console.log(`⚠️ You might want to try a different fee tier. Common tiers are: 
        - 100 (0.01%) for stable pairs
        - 500 (0.05%) for stable-like pairs
        - 3000 (0.3%) for standard pairs
        - 10000 (1%) for exotic pairs`);

      const proceed = readline.keyInYN(
        "Do you want to proceed with the current fee tier anyway?"
      );
      if (!proceed) {
        return false;
      }
    }
  } catch (error) {
    console.warn(`Could not check if pool exists: ${error.message}`);
  }

  // Approve token spending
  console.log(
    `Approving ${ethers.utils.formatUnits(amount, tokenA.decimals)} ${
      tokenA.symbol
    }...`
  );
  try {
    const approveTx = await tokenAContract.approve(routerAddress, amount);
    await approveTx.wait();
    console.log(`Approval successful!`);

    // Check allowance after approval
    const allowance = await tokenAContract.allowance(
      wallet.address,
      routerAddress
    );
    console.log(
      `Current allowance: ${ethers.utils.formatUnits(
        allowance,
        tokenA.decimals
      )} ${tokenA.symbol}`
    );

    if (allowance.lt(amount)) {
      console.error(
        `⚠️ Approval did not work correctly. Allowance (${ethers.utils.formatUnits(
          allowance,
          tokenA.decimals
        )}) is less than needed (${ethers.utils.formatUnits(
          amount,
          tokenA.decimals
        )})`
      );
      return false;
    }
  } catch (error) {
    console.error(`Approval failed: ${error.message}`);
    return false;
  }

  // Calculate minimum amount out based on slippage
  const amountOutMinimum = 0; // For simplicity, we're setting this to 0, but in production, calculate this properly

  // Execute swap
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  const params = {
    tokenIn: tokenA.address,
    tokenOut: tokenB.address,
    fee: feeTier,
    recipient: wallet.address,
    deadline: deadline,
    amountIn: amount,
    amountOutMinimum: amountOutMinimum,
    sqrtPriceLimitX96: 0, // No price limit
  };

  console.log(
    `Executing swap: ${ethers.utils.formatUnits(amount, tokenA.decimals)} ${
      tokenA.symbol
    } -> ${tokenB.symbol}...`
  );
  console.log(
    `Using DEX router at: ${routerAddress} with fee tier: ${feeTier / 10000}%`
  );

  // For debugging, show the transaction parameters
  console.log(
    `Swap parameters: ${JSON.stringify(
      params,
      (key, value) => {
        if (value && value._isBigNumber) return value.toString();
        return value;
      },
      2
    )}`
  );

  try {
    // Estimate gas for the transaction to check if it will fail
    try {
      const gasEstimate = await uniswapRouter.estimateGas.exactInputSingle(
        params,
        { from: wallet.address }
      );
      console.log(`Estimated gas: ${gasEstimate.toString()}`);
    } catch (error) {
      console.error(
        `⚠️ Gas estimation failed. The transaction will likely fail: ${error.message}`
      );

      // Try to get more specific error information
      if (error.reason || (error.data && error.data.message)) {
        console.error(`Error reason: ${error.reason || error.data.message}`);
      }

      const proceed = readline.keyInYN("Do you want to try the swap anyway?");
      if (!proceed) {
        return false;
      }
    }

    // Execute the swap transaction
    const swapTx = await uniswapRouter.exactInputSingle(params, {
      gasLimit: ethers.utils.hexlify(1000000),
    });

    console.log(`Swap transaction sent: ${swapTx.hash}`);

    const receipt = await swapTx.wait();
    if (receipt.status === 0) {
      console.error(`Swap transaction failed!`);
      return false;
    }

    console.log(`Swap successful! TX: ${receipt.transactionHash}`);

    // Check if token B balance increased
    const tokenBContract = new ethers.Contract(
      tokenB.address,
      ERC20_ABI,
      wallet
    );
    const newBalance = await tokenBContract.balanceOf(wallet.address);
    console.log(
      `New ${tokenB.symbol} balance: ${ethers.utils.formatUnits(
        newBalance,
        tokenB.decimals
      )}`
    );

    return true;
  } catch (error) {
    console.error(`Swap failed: ${error.message}`);

    // Try to get more specific error information
    if (error.reason) {
      console.error(`Error reason: ${error.reason}`);
    }

    // If it's a transaction error, check the receipt for more details
    if (error.receipt) {
      console.error(`Transaction receipt status: ${error.receipt.status}`);

      // Look for error events in the logs
      if (error.receipt.logs && error.receipt.logs.length > 0) {
        console.log(`Transaction logs: ${JSON.stringify(error.receipt.logs)}`);
      }
    }

    // Suggest troubleshooting steps
    console.log(`\nTroubleshooting suggestions:`);
    console.log(
      `1. Verify that a liquidity pool exists for this token pair with the specified fee tier (${feeTier})`
    );
    console.log(`2. Try a different fee tier (100, 500, 3000, or 10000)`);
    console.log(`3. Check if there's sufficient liquidity in the pool`);
    console.log(
      `4. Verify that the tokens support the Uniswap V3 swap interface`
    );
    console.log(`5. Try a smaller amount for the swap`);

    return false;
  }
}

// Sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random number between min and max
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Main function
async function main() {
  try {
    console.log("====== Uniswap V3 Automated Swap Script ======\n");

    // Enable debug mode
    const debugMode =
      process.env.DEBUG_MODE === "true" ||
      readline.keyInYN(
        "Enable debug mode for detailed logging? (Recommended for troubleshooting)"
      );

    // Connect to Ethereum
    const provider = await connectToEthereum();
    const network = await provider.getNetwork();
    console.log(
      `Connected to network: ${network.name} (Chain ID: ${network.chainId})`
    );

    // Get main wallet private key
    const mainPrivateKey =
      process.env.PRIVATE_KEY ||
      readline.question("Enter your main wallet private key: ", {
        hideEchoBack: true,
      });
    const mainWallet = new ethers.Wallet(mainPrivateKey, provider);
    console.log(`Main wallet address: ${mainWallet.address}`);

    // Get Token A and Token B addresses
    const tokenAAddress = readline.question("Enter Token A address: ");
    const tokenBAddress = readline.question("Enter Token B address: ");

    // Get token details
    const tokenADetails = await getTokenDetails(provider, tokenAAddress);
    const tokenBDetails = await getTokenDetails(provider, tokenBAddress);

    console.log(`\nToken A: ${tokenADetails.symbol} (${tokenAAddress})`);
    console.log(`Token B: ${tokenBDetails.symbol} (${tokenBAddress})`);

    // Check if token pair exists
    if (debugMode) {
      console.log("\nChecking token pair existence on DEXes...");
      // This is a basic check and might not work on all networks/DEXes
      try {
        // Different factory addresses for different chains
        const factoryAddresses = {
          1: "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Ethereum Mainnet Uniswap V3 Factory
          137: "0x1F98431c8aD98523631AE4a59f267346ea31F984", // Polygon Uniswap V3 Factory
          56: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865", // BSC PancakeSwap V3 Factory
          97: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865", // BSC Testnet PancakeSwap V3 Factory
        };

        if (factoryAddresses[network.chainId]) {
          const FACTORY_ABI = [
            "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
          ];

          const factory = new ethers.Contract(
            factoryAddresses[network.chainId],
            FACTORY_ABI,
            provider
          );

          // Check across common fee tiers
          const feeTiers = [100, 500, 3000, 10000];
          const existingPools = [];

          for (const fee of feeTiers) {
            try {
              const poolAddress = await factory.getPool(
                tokenAAddress,
                tokenBAddress,
                fee
              );
              if (
                poolAddress !== "0x0000000000000000000000000000000000000000"
              ) {
                existingPools.push({ fee, address: poolAddress });
                console.log(
                  `✅ Pool exists for fee tier ${fee} (${
                    fee / 10000
                  }%) at ${poolAddress}`
                );
              } else {
                console.log(`❌ No pool for fee tier ${fee} (${fee / 10000}%)`);
              }
            } catch (error) {
              console.log(`Could not check fee tier ${fee}: ${error.message}`);
            }
          }

          if (existingPools.length > 0) {
            console.log(
              `\nFound ${existingPools.length} existing pools for this token pair.`
            );
          } else {
            console.log(
              `\n⚠️ No pools found for this token pair. Swaps may fail. You might need to create a pool first or check token addresses.`
            );
          }
        }
      } catch (error) {
        console.log(`Could not check for existing pools: ${error.message}`);
      }
    }

    // Get fee tier
    console.log("\nCommon fee tiers:");
    console.log("- 100 = 0.01% (typically for stable pairs like USDC-USDT)");
    console.log("- 500 = 0.05% (for stable-like pairs)");
    console.log("- 3000 = 0.3% (most common for standard pairs)");
    console.log("- 10000 = 1% (for exotic pairs)");

    const feeTier = parseInt(
      readline.question("Enter fee tier (100, 500, 3000, or 10000): ") || "3000"
    );

    // Validate fee tier
    if (![100, 500, 3000, 10000].includes(feeTier)) {
      console.warn(
        `Warning: Unusual fee tier ${feeTier}. Common values are 100, 500, 3000, or 10000.`
      );
      const proceed = readline.keyInYN(
        "Do you want to proceed with this fee tier?"
      );
      if (!proceed) {
        throw new Error("User aborted due to unusual fee tier");
      }
    }

    // Get number of swaps to perform
    const totalSwaps = parseInt(
      readline.question("\nEnter number of swaps to perform: ")
    );

    // Get number of wallets to generate
    const walletCount = parseInt(
      readline.question("Enter number of wallets to generate: ")
    );

    // Get min and max token amount
    const minAmountStr = readline.question(
      `Enter minimum amount of ${tokenADetails.symbol} per swap: `
    );
    const maxAmountStr = readline.question(
      `Enter maximum amount of ${tokenADetails.symbol} per swap: `
    );

    const minAmount = ethers.utils.parseUnits(
      minAmountStr,
      tokenADetails.decimals
    );
    const maxAmount = ethers.utils.parseUnits(
      maxAmountStr,
      tokenADetails.decimals
    );

    // Get min and max waiting time between swaps
    const minWaitTime = parseInt(
      readline.question(
        "Enter minimum waiting time between swaps (in seconds): "
      )
    );
    const maxWaitTime = parseInt(
      readline.question(
        "Enter maximum waiting time between swaps (in seconds): "
      )
    );

    // Get retry options
    const maxRetries = debugMode
      ? parseInt(
          readline.question(
            "Enter maximum number of retries per failed swap (0 for no retries): "
          ) || "0"
        )
      : 0;

    // Generate wallets
    console.log(`\nGenerating ${walletCount} wallets...`);
    const generatedWallets = await generateWallets(walletCount);

    // Calculate total funds needed
    const avgAmount = minAmount.add(maxAmount).div(2);
    const fundAmount = avgAmount.mul(Math.ceil(totalSwaps / walletCount));

    // Fund wallets
    await fundWallets(
      provider,
      mainWallet,
      generatedWallets,
      tokenAAddress,
      tokenADetails,
      fundAmount
    );

    // Perform swaps
    console.log(`\nStarting ${totalSwaps} swaps...`);
    let completedSwaps = 0;

    for (let i = 0; i < totalSwaps; i++) {
      // Select a random wallet
      const walletIndex = i % walletCount;
      const wallet = generatedWallets[walletIndex].connect(provider);

      // Generate random amount between min and max
      const randomBN = new BigNumber(
        getRandomNumber(
          new BigNumber(minAmount.toString()).toNumber(),
          new BigNumber(maxAmount.toString()).toNumber()
        )
      );
      const swapAmount = ethers.BigNumber.from(randomBN.toString());

      // Execute swap
      console.log(`\n---- Swap ${i + 1}/${totalSwaps} ----`);
      console.log(`Using wallet: ${wallet.address}`);

      const tokenA = {
        address: tokenAAddress,
        decimals: tokenADetails.decimals,
        symbol: tokenADetails.symbol,
      };

      const tokenB = {
        address: tokenBAddress,
        decimals: tokenBDetails.decimals,
        symbol: tokenBDetails.symbol,
      };

      let success = false;
      let retries = 0;

      // Retry logic
      while (!success && retries <= maxRetries) {
        if (retries > 0) {
          console.log(`Retry ${retries}/${maxRetries}...`);
        }

        success = await executeSwap(
          provider,
          wallet,
          tokenA,
          tokenB,
          swapAmount,
          1,
          feeTier
        );

        if (!success && retries < maxRetries) {
          retries++;
          console.log(`Waiting 10 seconds before retry...`);
          await sleep(10000);
        } else {
          break;
        }
      }

      if (success) {
        completedSwaps++;
      }

      // Wait random time between swaps if not the last swap
      if (i < totalSwaps - 1) {
        const waitTime = getRandomNumber(minWaitTime, maxWaitTime);
        console.log(`Waiting ${waitTime} seconds before next swap...`);
        await sleep(waitTime * 1000);
      }
    }

    console.log(`\n====== Summary ======`);
    console.log(`Total swaps completed: ${completedSwaps}/${totalSwaps}`);
    console.log(`Wallets used: ${walletCount}`);
    console.log(`Fee tier used: ${feeTier} (${feeTier / 10000}%)`);
  } catch (error) {
    console.error(`Error in main function: ${error.message}`);
  }
}

// Run the script
main().catch(console.error);
