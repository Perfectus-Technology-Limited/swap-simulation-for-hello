# Uniswap V3 & Compatible DEX Automated Swap Script

A Node.js script for automating multiple token swaps on Uniswap V3 and compatible DEXes like PancakeSwap V3. This tool works across multiple networks including Ethereum, Polygon, Arbitrum, Optimism, and BNB Chain. It allows you to create and fund multiple wallets, then perform randomized swaps between any two ERC-20 tokens.

## Features

- Interactive setup with configurable parameters
- Multiple wallet generation for transaction distribution
- Automated funding of generated wallets from a main wallet
- Configurable swap amounts (random between min and max)
- Configurable waiting times between swaps (random between min and max)
- Support for any ERC-20 token pair available on Uniswap V3
- **🆕 Smart retry system with automatic parameter adjustment**
- **🆕 Intelligent error classification and handling**
- **🆕 Advanced analytics and detailed reporting**
- **🆕 Enhanced safety features and slippage protection**

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
DEBUG_MODE=true
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
- **🆕 Choose whether to enable smart retry with automatic parameter adjustment**

3. The script will then:
   - Generate the specified number of wallets
   - Fund them with ETH (for gas) and Token A from your main wallet
   - Perform the configured number of swaps, distributing them across the generated wallets
   - **🆕 Automatically retry failed swaps with adjusted parameters**
   - Wait random time intervals between swaps
   - **🆕 Provide real-time statistics and analytics**
   - **🆕 Generate detailed reports with recommendations**

## Smart Retry Features

The enhanced script now includes intelligent retry mechanisms:

### 🤖 Automatic Parameter Adjustment

- **Swap Amount Strategies**: 100% → 50% → 30% → 10% → 5% of original amount
- **Fee Tier Fallbacks**: 3000 → 500 → 10000 → 100 (based on pool availability)
- **Slippage Tolerance**: 1% → 2% → 5% → 10% → 20% (progressive increase)

### 🔍 Error Classification

- **LIQUIDITY**: Insufficient liquidity issues
- **NO_POOL**: Pool doesn't exist for fee tier
- **PRICE_IMPACT**: Price impact too high
- **GAS**: Gas-related problems
- **NETWORK**: Connectivity issues
- **INSUFFICIENT_BALANCE**: Wallet balance issues

### 📊 Analytics & Reporting

- Real-time success rate tracking
- Error frequency analysis
- Strategy effectiveness monitoring
- Detailed JSON reports with recommendations

## Example Run

```
====== Enhanced Uniswap V3 Automated Swap Script with Smart Retry ======

Enable debug mode for detailed logging? [y/n]: y
Attempting to connect to network: mainnet
Connected to network: mainnet (Chain ID: 1)
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
Enter preferred fee tier: 3000

Enable smart retry with automatic parameter adjustment? [y/n]: y

🤖 Smart retry is enabled. The script will automatically:
   - Adjust swap amounts if liquidity is insufficient
   - Try different fee tiers if pools don't exist
   - Increase slippage tolerance for price impact issues
   - Implement exponential backoff for network issues

========== Swap 1/5 ==========
Using wallet: 0xabc...123
Target amount: 25.5 USDC

🔄 Trying strategy: Original amount, Fee: 0.3%, Slippage: 1%
💡 Estimated output: 0.0156 WETH
✅ Swap successful with adjusted parameters!
📊 Gas used: 184,532

📊 Current Statistics:
   Total attempts: 1
   Success rate: 100.00%

=================== FINAL SUMMARY ===================
Total swaps attempted: 5
Successful swaps: 5
Failed swaps: 0
Success rate: 100.00%

🤖 Smart Retry Statistics:
   Total retry attempts: 8
   Retry success rate: 100.00%
   Most successful strategies: {"1.0_3000_100": 5}

💡 Recommendations for future runs:
   - Most successful configuration: 100% amount, 0.3% fee, 1% slippage

Save detailed report to file? [y/n]: y
📄 Report saved to: swap_report_1672531200000.json
```

## Supported Networks

The script supports the following networks:

- Ethereum Mainnet (chainId: 1)
- Goerli Testnet (chainId: 5)
- Polygon (chainId: 137)
- Arbitrum (chainId: 42161)
- Optimism (chainId: 10)
- BNB Chain (chainId: 56)
- BNB Chain Testnet (chainId: 97)

For BNB Chain, the script automatically uses PancakeSwap V3 router addresses instead of Uniswap.

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
- **🆕 Enhanced slippage protection**: The script now calculates proper minimum output amounts.
- **Monitor gas costs**: The script now includes intelligent gas estimation with buffers.
- **Use at your own risk**: Trading on DeFi platforms involves risk. Only use funds you can afford to lose.

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
- For BNB Chain: Use [PancakeSwap Info](https://pancakeswap.finance/info/pools)

### 🆕 Smart Retry Troubleshooting

The enhanced script automatically handles most common issues:

- **Liquidity Issues**: Automatically reduces swap amounts
- **Pool Not Found**: Tries alternative fee tiers
- **Price Impact**: Increases slippage tolerance
- **Network Issues**: Implements exponential backoff
- **Gas Problems**: Adjusts gas limits automatically

## Changelog

### Version 2.0.0 - Enhanced Smart Retry System

#### 🆕 New Features

- **Smart Retry Manager**: Intelligent retry system with automatic parameter adjustment
- **Error Classification**: Advanced error detection and categorization system
- **Multiple Strategy Testing**: Automatically tries different combinations of:
  - Swap amounts (100%, 50%, 30%, 10%, 5%)
  - Fee tiers (3000, 500, 10000, 100)
  - Slippage tolerance (1%, 2%, 5%, 10%, 20%)
- **Real-time Analytics**: Live success rate tracking and error frequency analysis
- **Detailed Reporting**: JSON reports with strategy effectiveness and recommendations
- **Emergency Balance Checking**: Automatic wallet balance verification on critical errors

#### 🔧 Improvements

- **Enhanced Slippage Protection**: Proper minimum output calculation using quoter contracts
- **Better Gas Estimation**: Intelligent gas estimation with 20% safety buffer
- **Improved Allowance Handling**: Automatic allowance reset for problematic tokens
- **Exponential Backoff**: Smart retry delays with jitter to avoid rate limiting
- **Graceful Error Handling**: Better error messages and recovery strategies

#### 🛡️ Safety Enhancements

- **Pool Existence Verification**: Check for liquidity pools before attempting swaps
- **Balance Validation**: Comprehensive balance checking before and after swaps
- **Transaction Status Monitoring**: Enhanced transaction receipt validation
- **Graceful Shutdown**: Proper signal handling for script interruption

#### 📊 Analytics Features

- **Success Rate Tracking**: Real-time monitoring of swap success rates
- **Error Pattern Analysis**: Identification of most common failure types
- **Strategy Effectiveness**: Tracking which parameter combinations work best
- **Performance Recommendations**: AI-powered suggestions for optimal configurations

#### 🔍 Developer Features

- **Enhanced Debug Mode**: Detailed logging and troubleshooting information
- **Error Stack Traces**: Complete error reporting for better debugging
- **Configuration Validation**: Input validation and sanity checks
- **Report Generation**: Automatic JSON report creation with detailed analytics

#### 🐛 Bug Fixes

- Fixed variable scope issues in report generation
- Improved error handling for network disconnections
- Better handling of edge cases in token approvals
- Fixed memory leaks in long-running operations

#### 💡 Usability Improvements

- Interactive smart retry configuration
- Progressive error reporting during execution
- Colored console output for better readability
- Comprehensive final summary with actionable insights

## License

This project is licensed under the MIT License - see the LICENSE file for details.
