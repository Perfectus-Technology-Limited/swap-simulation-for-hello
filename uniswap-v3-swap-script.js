// Enhanced Uniswap V3 Automated Swap Script with Smart Retry Logic
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

// Smart retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 30000,

  // Swap amount adjustment strategies
  amountStrategies: [
    { factor: 1.0, description: "Original amount" },
    { factor: 0.5, description: "50% of original amount" },
    { factor: 0.3, description: "30% of original amount" },
    { factor: 0.1, description: "10% of original amount" },
    { factor: 0.05, description: "5% of original amount" },
  ],

  // Fee tier fallback strategies
  feeTierStrategies: [
    3000, // 0.3% - most common
    500, // 0.05% - stable pairs
    10000, // 1% - exotic pairs
    100, // 0.01% - very stable pairs
  ],

  // Slippage strategies (in basis points, 100 = 1%)
  slippageStrategies: [
    100, // 1%
    200, // 2%
    500, // 5%
    1000, // 10%
    2000, // 20% - last resort
  ],
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

// Error classification system
class SwapErrorClassifier {
  static classifyError(error) {
    const errorMessage = error.message.toLowerCase();
    const errorReason = error.reason ? error.reason.toLowerCase() : "";

    // Liquidity issues
    if (
      errorMessage.includes("insufficient liquidity") ||
      errorMessage.includes("spr") ||
      errorReason.includes("spr")
    ) {
      return {
        type: "LIQUIDITY",
        severity: "HIGH",
        suggestedActions: [
          "REDUCE_AMOUNT",
          "CHANGE_FEE_TIER",
          "INCREASE_SLIPPAGE",
        ],
      };
    }

    // Pool doesn't exist
    if (
      (errorMessage.includes("pool") && errorMessage.includes("not")) ||
      errorMessage.includes("no pool") ||
      errorReason.includes("pool")
    ) {
      return {
        type: "NO_POOL",
        severity: "HIGH",
        suggestedActions: ["CHANGE_FEE_TIER"],
      };
    }

    // Price impact too high
    if (
      errorMessage.includes("price") ||
      errorMessage.includes("slippage") ||
      errorMessage.includes("too little received")
    ) {
      return {
        type: "PRICE_IMPACT",
        severity: "MEDIUM",
        suggestedActions: ["REDUCE_AMOUNT", "INCREASE_SLIPPAGE"],
      };
    }

    // Gas issues
    if (
      errorMessage.includes("gas") ||
      errorMessage.includes("out of gas") ||
      errorMessage.includes("intrinsic gas")
    ) {
      return {
        type: "GAS",
        severity: "LOW",
        suggestedActions: ["RETRY"],
      };
    }

    // Network issues
    if (
      errorMessage.includes("network") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("connection")
    ) {
      return {
        type: "NETWORK",
        severity: "LOW",
        suggestedActions: ["RETRY"],
      };
    }

    // Insufficient balance
    if (
      errorMessage.includes("insufficient") &&
      (errorMessage.includes("balance") || errorMessage.includes("funds"))
    ) {
      return {
        type: "INSUFFICIENT_BALANCE",
        severity: "HIGH",
        suggestedActions: ["REDUCE_AMOUNT"],
      };
    }

    // Unknown error
    return {
      type: "UNKNOWN",
      severity: "MEDIUM",
      suggestedActions: [
        "REDUCE_AMOUNT",
        "CHANGE_FEE_TIER",
        "INCREASE_SLIPPAGE",
      ],
    };
  }
}

// Smart retry manager
class SmartRetryManager {
  constructor(config = RETRY_CONFIG) {
    this.config = config;
    this.statistics = {
      totalAttempts: 0,
      successfulSwaps: 0,
      errorsByType: {},
      strategiesUsed: {},
    };
  }

  async executeWithRetry(swapFunction, initialParams) {
    let lastError = null;
    let currentParams = { ...initialParams };

    // Try different strategies
    for (let amountStrategy of this.config.amountStrategies) {
      for (let feeTier of this.config.feeTierStrategies) {
        for (let slippage of this.config.slippageStrategies) {
          // Skip if this is the same as what we already tried
          if (
            amountStrategy.factor === 1.0 &&
            feeTier === initialParams.feeTier &&
            slippage === this.config.slippageStrategies[0]
          ) {
            // Already tried this combination, skip unless it's the first attempt
            if (this.statistics.totalAttempts > 0) continue;
          }

          // Adjust parameters
          currentParams = {
            ...initialParams,
            amount: initialParams.amount
              .mul(Math.floor(amountStrategy.factor * 1000))
              .div(1000),
            feeTier: feeTier,
            slippage: slippage,
          };

          console.log(
            `\n🔄 Trying strategy: ${amountStrategy.description}, Fee: ${
              feeTier / 10000
            }%, Slippage: ${slippage / 100}%`
          );

          try {
            this.statistics.totalAttempts++;
            const result = await swapFunction(currentParams);

            if (result.success) {
              this.statistics.successfulSwaps++;
              this._recordStrategySuccess(amountStrategy, feeTier, slippage);
              console.log(`✅ Swap successful with adjusted parameters!`);
              return { success: true, params: currentParams, result };
            }

            lastError = result.error;
          } catch (error) {
            lastError = error;
            this._recordError(error);

            // Classify error and decide if we should continue
            const classification = SwapErrorClassifier.classifyError(error);
            console.log(
              `❌ Error type: ${classification.type}, Severity: ${classification.severity}`
            );

            // If it's a fatal error for this strategy combination, skip to next
            if (
              classification.severity === "HIGH" &&
              !this._shouldContinueWithError(classification, currentParams)
            ) {
              console.log(
                `⏩ Skipping to next strategy due to ${classification.type} error`
              );
              break;
            }

            // Add delay between retries
            await this._delay(
              this._calculateDelay(this.statistics.totalAttempts)
            );
          }
        }
      }
    }

    // All strategies failed
    console.log(
      `❌ All retry strategies exhausted. Last error:`,
      lastError?.message || "Unknown error"
    );
    return { success: false, error: lastError, params: currentParams };
  }

  _shouldContinueWithError(classification, params) {
    // For certain error types, don't try more aggressive slippage
    if (classification.type === "NO_POOL" && params.slippage > 500) {
      return false;
    }

    if (
      classification.type === "INSUFFICIENT_BALANCE" &&
      params.amount.lte(ethers.utils.parseEther("0.001"))
    ) {
      return false;
    }

    return true;
  }

  _recordError(error) {
    const classification = SwapErrorClassifier.classifyError(error);
    this.statistics.errorsByType[classification.type] =
      (this.statistics.errorsByType[classification.type] || 0) + 1;
  }

  _recordStrategySuccess(amountStrategy, feeTier, slippage) {
    const strategyKey = `${amountStrategy.factor}_${feeTier}_${slippage}`;
    this.statistics.strategiesUsed[strategyKey] =
      (this.statistics.strategiesUsed[strategyKey] || 0) + 1;
  }

  _calculateDelay(attemptNumber) {
    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.baseDelayMs * Math.pow(2, attemptNumber - 1),
      this.config.maxDelayMs
    );

    // Add random jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() - 0.5);
    return Math.max(1000, delay + jitter);
  }

  async _delay(ms) {
    console.log(`⏰ Waiting ${Math.floor(ms / 1000)}s before next attempt...`);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatistics() {
    return {
      ...this.statistics,
      successRate:
        this.statistics.totalAttempts > 0
          ? (
              (this.statistics.successfulSwaps /
                this.statistics.totalAttempts) *
              100
            ).toFixed(2) + "%"
          : "0%",
    };
  }
}

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

// Calculate minimum amount out with slippage protection
function calculateMinAmountOut(expectedAmountOut, slippageBasisPoints) {
  // slippageBasisPoints: 100 = 1%, 500 = 5%, etc.
  const slippageFactor = ethers.BigNumber.from(10000 - slippageBasisPoints);
  return expectedAmountOut.mul(slippageFactor).div(10000);
}

// Enhanced swap execution with better error handling
async function executeSwap(params) {
  const { provider, wallet, tokenA, tokenB, amount, feeTier, slippage } =
    params;

  try {
    // Get chain ID to determine which router to use
    const { chainId } = await provider.getNetwork();

    // Get the appropriate router address for this network
    const routerAddress = ROUTER_ADDRESSES[chainId];
    if (!routerAddress) {
      throw new Error(`No router address configured for chain ID ${chainId}`);
    }

    const tokenAContract = new ethers.Contract(
      tokenA.address,
      ERC20_ABI,
      wallet
    );
    const uniswapRouter = new ethers.Contract(
      routerAddress,
      UNISWAP_ROUTER_ABI,
      wallet
    );

    // Check token balance before proceeding
    const balance = await tokenAContract.balanceOf(wallet.address);
    console.log(
      `Current balance: ${ethers.utils.formatUnits(balance, tokenA.decimals)} ${
        tokenA.symbol
      }`
    );

    if (balance.lt(amount)) {
      throw new Error(
        `Insufficient balance! Have ${ethers.utils.formatUnits(
          balance,
          tokenA.decimals
        )} ${tokenA.symbol}, need ${ethers.utils.formatUnits(
          amount,
          tokenA.decimals
        )} ${tokenA.symbol}`
      );
    }

    // Check and set allowance if needed
    const currentAllowance = await tokenAContract.allowance(
      wallet.address,
      routerAddress
    );
    if (currentAllowance.lt(amount)) {
      console.log(
        `Setting allowance for ${ethers.utils.formatUnits(
          amount,
          tokenA.decimals
        )} ${tokenA.symbol}...`
      );

      // Reset allowance to 0 first if it's not 0 (some tokens require this)
      if (!currentAllowance.isZero()) {
        const resetTx = await tokenAContract.approve(routerAddress, 0);
        await resetTx.wait();
      }

      const approveTx = await tokenAContract.approve(routerAddress, amount);
      await approveTx.wait();
      console.log(`✅ Approval successful!`);
    }

    // Try to get a quote for the swap to estimate output amount
    let estimatedAmountOut = ethers.BigNumber.from(0);
    try {
      // Different quoter addresses for different chains
      const quoterAddresses = {
        1: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6", // Ethereum Mainnet
        137: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6", // Polygon
        56: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2", // BSC PancakeSwap V3
        97: "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2", // BSC Testnet
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

        estimatedAmountOut = await quoter.callStatic.quoteExactInputSingle(
          tokenA.address,
          tokenB.address,
          feeTier,
          amount,
          0
        );

        console.log(
          `💡 Estimated output: ${ethers.utils.formatUnits(
            estimatedAmountOut,
            tokenB.decimals
          )} ${tokenB.symbol}`
        );
      }
    } catch (error) {
      console.log(`⚠️ Could not get quote: ${error.message}`);
      // Continue without quote
    }

    // Calculate minimum amount out with slippage protection
    const amountOutMinimum = estimatedAmountOut.gt(0)
      ? calculateMinAmountOut(estimatedAmountOut, slippage)
      : 0;

    // Execute swap
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    const swapParams = {
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
      `🔄 Executing swap: ${ethers.utils.formatUnits(
        amount,
        tokenA.decimals
      )} ${tokenA.symbol} -> ${tokenB.symbol} (Fee: ${
        feeTier / 10000
      }%, Slippage: ${slippage / 100}%)`
    );

    // Estimate gas first
    let gasEstimate;
    try {
      gasEstimate = await uniswapRouter.estimateGas.exactInputSingle(
        swapParams
      );
      console.log(`📊 Estimated gas: ${gasEstimate.toString()}`);
    } catch (error) {
      console.log(`⚠️ Gas estimation failed: ${error.message}`);
      gasEstimate = ethers.utils.hexlify(1200000); // Use higher default gas limit
    }

    // Execute the swap transaction
    const swapTx = await uniswapRouter.exactInputSingle(swapParams, {
      gasLimit: gasEstimate.mul(120).div(100), // Add 20% buffer
    });

    console.log(`📤 Swap transaction sent: ${swapTx.hash}`);

    const receipt = await swapTx.wait();
    if (receipt.status === 0) {
      throw new Error(`Transaction failed with status 0`);
    }

    console.log(`✅ Swap successful! TX: ${receipt.transactionHash}`);

    // Check final balances
    const newBalanceA = await tokenAContract.balanceOf(wallet.address);
    const tokenBContract = new ethers.Contract(
      tokenB.address,
      ERC20_ABI,
      wallet
    );
    const newBalanceB = await tokenBContract.balanceOf(wallet.address);

    console.log(`📊 Final balances:`);
    console.log(
      `   ${tokenA.symbol}: ${ethers.utils.formatUnits(
        newBalanceA,
        tokenA.decimals
      )}`
    );
    console.log(
      `   ${tokenB.symbol}: ${ethers.utils.formatUnits(
        newBalanceB,
        tokenB.decimals
      )}`
    );

    return {
      success: true,
      transactionHash: receipt.transactionHash,
      gasUsed: receipt.gasUsed.toString(),
      finalBalanceA: newBalanceA,
      finalBalanceB: newBalanceB,
    };
  } catch (error) {
    console.log(`❌ Swap failed: ${error.message}`);

    // Enhanced error logging
    if (error.reason) {
      console.log(`📋 Error reason: ${error.reason}`);
    }

    if (error.code) {
      console.log(`📋 Error code: ${error.code}`);
    }

    return { success: false, error };
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
    console.log(
      "====== Enhanced Uniswap V3 Automated Swap Script with Smart Retry ======\n"
    );

    // Initialize retry manager
    const retryManager = new SmartRetryManager();

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

    // Get fee tier
    console.log("\nCommon fee tiers:");
    console.log("- 100 = 0.01% (typically for stable pairs like USDC-USDT)");
    console.log("- 500 = 0.05% (for stable-like pairs)");
    console.log("- 3000 = 0.3% (most common for standard pairs)");
    console.log("- 10000 = 1% (for exotic pairs)");

    const feeTier = parseInt(
      readline.question(
        "Enter preferred fee tier (100, 500, 3000, or 10000): "
      ) || "3000"
    );

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

    // Ask about smart retry settings
    const useSmartRetry = readline.keyInYN(
      "Enable smart retry with automatic parameter adjustment? (Highly recommended)"
    );

    if (useSmartRetry) {
      console.log(
        "\n🤖 Smart retry is enabled. The script will automatically:"
      );
      console.log("   - Adjust swap amounts if liquidity is insufficient");
      console.log("   - Try different fee tiers if pools don't exist");
      console.log("   - Increase slippage tolerance for price impact issues");
      console.log("   - Implement exponential backoff for network issues");
    }

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
    console.log(`\nStarting ${totalSwaps} swaps with smart retry enabled...`);
    let completedSwaps = 0;
    let failedSwaps = 0;

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

      console.log(`\n========== Swap ${i + 1}/${totalSwaps} ==========`);
      console.log(`Using wallet: ${wallet.address}`);
      console.log(
        `Target amount: ${ethers.utils.formatUnits(
          swapAmount,
          tokenADetails.decimals
        )} ${tokenADetails.symbol}`
      );

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

      // Prepare swap parameters
      const swapParams = {
        provider,
        wallet,
        tokenA,
        tokenB,
        amount: swapAmount,
        feeTier: feeTier,
        slippage: 100, // Start with 1% slippage
      };

      let result;

      if (useSmartRetry) {
        // Use smart retry manager
        result = await retryManager.executeWithRetry(executeSwap, swapParams);
      } else {
        // Traditional single attempt
        result = await executeSwap(swapParams);
      }

      if (result.success) {
        completedSwaps++;
        console.log(`✅ Swap ${i + 1} completed successfully!`);

        if (result.result) {
          console.log(`📊 Gas used: ${result.result.gasUsed}`);
          console.log(`📦 Transaction: ${result.result.transactionHash}`);
        }
      } else {
        failedSwaps++;
        console.log(`❌ Swap ${i + 1} failed after all retry attempts`);

        if (result.error) {
          const errorClassification = SwapErrorClassifier.classifyError(
            result.error
          );
          console.log(`📋 Final error type: ${errorClassification.type}`);
        }
      }

      // Display running statistics
      if (useSmartRetry && (i + 1) % 5 === 0) {
        const stats = retryManager.getStatistics();
        console.log(`\n📊 Current Statistics:`);
        console.log(`   Total attempts: ${stats.totalAttempts}`);
        console.log(`   Success rate: ${stats.successRate}`);
        console.log(
          `   Most common errors: ${JSON.stringify(
            stats.errorsByType,
            null,
            2
          )}`
        );
      }

      // Wait random time between swaps if not the last swap
      if (i < totalSwaps - 1) {
        const waitTime = getRandomNumber(minWaitTime, maxWaitTime);
        console.log(`⏰ Waiting ${waitTime} seconds before next swap...`);
        await sleep(waitTime * 1000);
      }
    }

    // Final summary
    console.log(`\n=================== FINAL SUMMARY ===================`);
    console.log(`Total swaps attempted: ${totalSwaps}`);
    console.log(`Successful swaps: ${completedSwaps}`);
    console.log(`Failed swaps: ${failedSwaps}`);
    console.log(
      `Success rate: ${((completedSwaps / totalSwaps) * 100).toFixed(2)}%`
    );
    console.log(`Wallets used: ${walletCount}`);
    console.log(`Primary fee tier: ${feeTier} (${feeTier / 10000}%)`);

    // Get final stats (will be empty object if smart retry wasn't used)
    const finalStats = useSmartRetry
      ? retryManager.getStatistics()
      : {
          totalAttempts: totalSwaps,
          successfulSwaps: completedSwaps,
          errorsByType: {},
          strategiesUsed: {},
          successRate: ((completedSwaps / totalSwaps) * 100).toFixed(2) + "%",
        };

    if (useSmartRetry) {
      console.log(`\n🤖 Smart Retry Statistics:`);
      console.log(`   Total retry attempts: ${finalStats.totalAttempts}`);
      console.log(`   Retry success rate: ${finalStats.successRate}`);
      console.log(`   Error breakdown:`, finalStats.errorsByType);

      if (Object.keys(finalStats.strategiesUsed).length > 0) {
        console.log(
          `   Most successful strategies:`,
          finalStats.strategiesUsed
        );
      }

      console.log(`\n💡 Recommendations for future runs:`);

      // Analyze most common errors and provide recommendations
      const errorTypes = Object.keys(finalStats.errorsByType);
      if (errorTypes.length > 0) {
        const mostCommonError = errorTypes.reduce((a, b) =>
          finalStats.errorsByType[a] > finalStats.errorsByType[b] ? a : b
        );

        switch (mostCommonError) {
          case "LIQUIDITY":
            console.log(`   - Consider using smaller swap amounts`);
            console.log(`   - Try different fee tiers (500 or 10000)`);
            break;
          case "NO_POOL":
            console.log(`   - Verify token pair exists on this DEX`);
            console.log(`   - Check different fee tiers for available pools`);
            break;
          case "PRICE_IMPACT":
            console.log(`   - Use smaller swap amounts to reduce price impact`);
            console.log(`   - Consider higher slippage tolerance`);
            break;
          case "GAS":
            console.log(`   - Check network congestion`);
            console.log(`   - Consider using different times for swapping`);
            break;
          case "NETWORK":
            console.log(`   - Check RPC provider reliability`);
            console.log(`   - Consider using a different provider`);
            break;
        }
      }

      // Analyze successful strategies
      const strategies = Object.keys(finalStats.strategiesUsed);
      if (strategies.length > 0) {
        const bestStrategy = strategies.reduce((a, b) =>
          finalStats.strategiesUsed[a] > finalStats.strategiesUsed[b] ? a : b
        );

        const [factor, fee, slippage] = bestStrategy.split("_");
        console.log(
          `   - Most successful configuration: ${(
            parseFloat(factor) * 100
          ).toFixed(0)}% amount, ${parseInt(fee) / 10000}% fee, ${
            parseInt(slippage) / 100
          }% slippage`
        );
      }
    }

    // Check final wallet balances
    console.log(`\n💰 Final Wallet Balances:`);
    for (let i = 0; i < Math.min(walletCount, 3); i++) {
      // Show first 3 wallets
      const wallet = generatedWallets[i].connect(provider);

      try {
        const tokenAContract = new ethers.Contract(
          tokenAAddress,
          ERC20_ABI,
          wallet
        );
        const tokenBContract = new ethers.Contract(
          tokenBAddress,
          ERC20_ABI,
          wallet
        );

        const balanceA = await tokenAContract.balanceOf(wallet.address);
        const balanceB = await tokenBContract.balanceOf(wallet.address);
        const ethBalance = await provider.getBalance(wallet.address);

        console.log(`   Wallet ${i + 1} (${wallet.address.slice(0, 8)}...):`);
        console.log(
          `     ${tokenADetails.symbol}: ${ethers.utils.formatUnits(
            balanceA,
            tokenADetails.decimals
          )}`
        );
        console.log(
          `     ${tokenBDetails.symbol}: ${ethers.utils.formatUnits(
            balanceB,
            tokenBDetails.decimals
          )}`
        );
        console.log(`     ETH: ${ethers.utils.formatEther(ethBalance)}`);
      } catch (error) {
        console.log(`     Error checking wallet ${i + 1}: ${error.message}`);
      }
    }

    if (walletCount > 3) {
      console.log(`   ... and ${walletCount - 3} more wallets`);
    }

    console.log(`\n🎉 Script execution completed!`);

    // Offer to save detailed report
    if (readline.keyInYN("Save detailed report to file?")) {
      const reportData = {
        timestamp: new Date().toISOString(),
        configuration: {
          totalSwaps,
          walletCount,
          minAmount: minAmountStr,
          maxAmount: maxAmountStr,
          feeTier,
          minWaitTime,
          maxWaitTime,
          network: network.name,
          chainId: network.chainId,
          smartRetryEnabled: useSmartRetry,
        },
        results: {
          completedSwaps,
          failedSwaps,
          successRate: ((completedSwaps / totalSwaps) * 100).toFixed(2) + "%",
        },
        smartRetryStats: finalStats,
        tokens: {
          tokenA: { symbol: tokenADetails.symbol, address: tokenAAddress },
          tokenB: { symbol: tokenBDetails.symbol, address: tokenBAddress },
        },
      };

      const fs = require("fs");
      const filename = `swap_report_${Date.now()}.json`;

      try {
        fs.writeFileSync(filename, JSON.stringify(reportData, null, 2));
        console.log(`📄 Report saved to: ${filename}`);
      } catch (error) {
        console.log(`❌ Could not save report: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`💥 Fatal error in main function: ${error.message}`);
    console.error(`Stack trace:`, error.stack);

    // Emergency wallet balance check if we have wallets
    if (
      typeof generatedWallets !== "undefined" &&
      generatedWallets.length > 0
    ) {
      console.log(`\n🚨 Emergency wallet balance check:`);

      try {
        const wallet = generatedWallets[0].connect(provider);
        const ethBalance = await provider.getBalance(wallet.address);
        console.log(
          `   First wallet ETH balance: ${ethers.utils.formatEther(ethBalance)}`
        );

        if (typeof tokenADetails !== "undefined") {
          const tokenAContract = new ethers.Contract(
            tokenAAddress,
            ERC20_ABI,
            wallet
          );
          const balanceA = await tokenAContract.balanceOf(wallet.address);
          console.log(
            `   First wallet ${
              tokenADetails.symbol
            } balance: ${ethers.utils.formatUnits(
              balanceA,
              tokenADetails.decimals
            )}`
          );
        }
      } catch (balanceError) {
        console.log(
          `   Could not check emergency balances: ${balanceError.message}`
        );
      }
    }
  }
}

// Enhanced error handling for the entire script
process.on("unhandledRejection", (reason, promise) => {
  console.error("🚨 Unhandled Rejection at:", promise, "reason:", reason);
  console.error("Stack trace:", reason.stack);
});

process.on("uncaughtException", (error) => {
  console.error("🚨 Uncaught Exception:", error.message);
  console.error("Stack trace:", error.stack);
  process.exit(1);
});

// Graceful shutdown handler
process.on("SIGINT", () => {
  console.log("\n🛑 Received SIGINT. Gracefully shutting down...");
  console.log("💡 If swaps were in progress, check wallet balances manually.");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM. Gracefully shutting down...");
  process.exit(0);
});

// Run the script
console.log("🚀 Starting Enhanced Uniswap V3 Swap Script...");
main().catch((error) => {
  console.error(`💥 Script failed:`, error.message);
  console.error(`Stack trace:`, error.stack);
  process.exit(1);
});
