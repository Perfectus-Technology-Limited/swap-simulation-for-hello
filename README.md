## Troubleshooting

### Common Swap Failures

If your swaps are failing with "transaction failed" or "CALL_EXCEPTION" errors, there are several possible causes:

1. **Nonexistent Liquidity Pool**: The script now attempts to check if a pool exists for your token pair at the specified fee tier. If no pool exists, the swap will fail.

2. **Incorrect Fee Tier**: Different DEXes and token pairs use different fee tiers. If you're seeing errors like:

   ```
   Swap failed: transaction failed [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ]
   ```

   Try a different fee tier. For example:

   - 100 (0.01%) for stable pairs like USDC-USDT
   - 500 (0.05%) for stable-like pairs
   - 3000 (0.3%) for most standard pairs
   - 10000 (1%) for exotic pairs

3. **Insufficient Liquidity**: Even if a pool exists, it might not have enough liquidity to support your trade.

4. **Token Issues**: Some tokens have transfer restrictions, fees, or other mechanisms that can interfere with swaps.

5. **Router Compatibility**: Make sure you're using the correct router for the network and DEX you're trying to use.

### Using the Debug Mode

The script now has improved error detection and reporting. When a swap fails, it will:

- Attempt to provide detailed error information
- Check if the pool exists for the token pair
- Suggest potential fixes
- Show troubleshooting steps

### Checking for Pool Existence

If you're unsure if a pool exists for your token pair, you can check using block explorers:

- For Ethereum/Polygon: Use [Uniswap Info](https://info.uniswap.org/#/pools)
- For BNB Chain: Use [PancakeSwap Info](https://pancakeswap.finance/info/pools)## Supported Networks

The script supports the following networks:

- Ethereum Mainnet (chainId: 1)
- Goerli Testnet (chainId: 5)
- Polygon (chainId: 137)
- Arbitrum (chainId: 42161)
- Optimism (chainId: 10)
- BNB Chain (chainId: 56)
- BNB Chain Testnet (chainId: 97)

For BNB Chain, the script automatically uses PancakeSwap V3 router addresses instead of Uniswap.# Uniswap V3 & Compatible DEX Automated Swap Script

A Node.js script for automating multiple token swaps on Uniswap V3 and compatible DEXes like PancakeSwap V3. This tool works across multiple networks including Ethereum, Polygon, Arbitrum, Optimism, and BNB Chain. It allows you to create and fund multiple wallets, then perform randomized swaps between any two ERC-20 tokens.

## Features

- Interactive setup with configurable parameters
- Multiple wallet generation for transaction distribution
- Automated funding of generated wallets from a main wallet
- Configurable swap amounts (random between min and max)
- Configurable waiting times between swaps (random between min and max)
- Support for any ERC-20 token pair available on Uniswap V3

## Prerequisites

- Node.js (v14+)
- npm or yarn
- Access to an Ethereum JSON-RPC provider (Infura, Alchemy, etc.)
- A funded Ethereum wallet with private key access

## Installation

1. Clone this repository or download the script:

```bash
git clone https://github.com/yourusername/uniswap-v3-swap-script.git
cd uniswap-v3-swap-script
```

2. Install the required dependencies:

```bash
npm install ethers@5.7.2 dotenv readline-sync @uniswap/v3-periphery @uniswap/v3-core bignumber.js
```

## Configuration

Create a `.env` file in the root directory with the following variables (optional):

```
NETWORK=mainnet
PROVIDER_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=your_private_key_here
```

Available network options:

- `mainnet` - Ethereum Mainnet
- `goerli` - Ethereum Goerli Testnet
- `sepolia` - Ethereum Sepolia Testnet
- `polygon` - Polygon Mainnet
- `arbitrum` - Arbitrum One
- `optimism` - Optimism Mainnet
- `bsc` - BNB Smart Chain Mainnet
- `bsc-testnet` - BNB Smart Chain Testnet
- `avalanche` - Avalanche C-Chain

The script will automatically detect if there's a mismatch between your specified network and the actual network your provider connects to.

If you don't provide these in the `.env` file, the script will prompt you for them during execution.

## Usage

1. Run the script:

```bash
node uniswap-v3-swap-script.js
```

2. Follow the interactive prompts:

- If not in .env, provide your Ethereum provider URL
- If not in .env, provide your main wallet private key
- Enter Token A address (the token you're swapping from)
- Enter Token B address (the token you're swapping to)
- **Select the fee tier for the trading pair (100, 500, 3000, or 10000)**
- Enter number of swaps to perform
- Enter number of wallets to generate
- Enter minimum and maximum amounts of Token A per swap
- Enter minimum and maximum waiting times between swaps (in seconds)

3. The script will then:
   - Generate the specified number of wallets
   - Fund them with ETH (for gas) and Token A from your main wallet
   - Perform the configured number of swaps, distributing them across the generated wallets
   - Wait random time intervals between swaps
   - Provide a summary of completed swaps

## Example Run

```
====== Uniswap V3 Automated Swap Script ======

Attempting to connect to network: mainnet
Detected network: bnbt (Chain ID: 97)
⚠️ WARNING: Expected chain ID 1 (mainnet), but connected to chain ID 97 (bnbt)
Network mismatch detected. Do you want to proceed anyway? [y/n]: y
Enter your main wallet private key: **************************************
Main wallet address: 0x123...abc

Enter Token A address: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
Enter Token B address: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2

Token A: USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
Token B: WETH (0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)

Common fee tiers:
- 100 = 0.01% (typically for stable pairs like USDC-USDT)
- 500 = 0.05% (for stable-like pairs)
- 3000 = 0.3% (most common for standard pairs)
- 10000 = 1% (for exotic pairs)
Enter fee tier (100, 500, 3000, or 10000): 500

Enter number of swaps to perform: 5
Enter number of wallets to generate: 2
Enter minimum amount of USDC per swap: 10
Enter maximum amount of USDC per swap: 50
Enter minimum waiting time between swaps (in seconds): 60
Enter maximum waiting time between swaps (in seconds): 300

Generating 2 wallets...
Generated wallet 1: 0xabc...123
Generated wallet 2: 0xdef...456

Funding 2 wallets with 150 USDC...
Sent 0.05 ETH to 0xabc...123 for gas
Sent 75 USDC to 0xabc...123
Sent 0.05 ETH to 0xdef...456 for gas
Sent 75 USDC to 0xdef...456

Starting 5 swaps...

---- Swap 1/5 ----
Using wallet: 0xabc...123
Approving 22.5 USDC...
Executing swap: 22.5 USDC -> WETH...
Swap successful! TX: 0x789...def
Waiting 157 seconds before next swap...

[... remaining swaps ...]

====== Summary ======
Total swaps completed: 5/5
Wallets used: 2
Fee tier used: 500 (0.05%)
```

## Customization

### Fee Tiers

The script now asks for the fee tier during setup, with the following options:

- 0.01% (100) - For stable pairs like USDC-USDT
- 0.05% (500) - For stable-like pairs
- 0.3% (3000) - For most standard pairs
- 1% (10000) - For exotic pairs

The fee tier represents the trading fee percentage that liquidity providers earn for that pool. Different token pairs typically have different optimal fee tiers depending on their volatility and trading volume.

### Router Addresses

The script includes router addresses for Uniswap V3 on Ethereum, Polygon, Arbitrum, and Optimism, as well as PancakeSwap V3 on BNB Chain. If you need to use a different DEX, you can add its router address to the `ROUTER_ADDRESSES` object in the script.

## Safety and Security Notes

- **Never share your private key**: Keep your `.env` file secure and never commit it to a repository.
- **Test on testnet first**: Always test your setup on a testnet (Goerli, Sepolia) before running on mainnet.
- **Set reasonable slippage**: The script sets `amountOutMinimum` to 0 for simplicity, but in production, you should calculate this based on an acceptable slippage percentage.
- **Monitor gas costs**: The script uses a fixed gas limit. In production, you may want to use gas estimation.
- **Use at your own risk**: Trading on DeFi platforms involves risk. Only use funds you can afford to lose.

## Troubleshooting

If you encounter issues:

1. **Insufficient funds**: Ensure your main wallet has enough ETH and Token A.
2. **Transaction failures**: Check that there's sufficient liquidity for your token pair at the specified fee tier.
3. **RPC errors**: Your provider might have rate limits. Consider using a dedicated RPC endpoint.
4. **Token allowance**: The script handles approvals, but if you stop the script mid-execution, you might need to reset allowances.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
