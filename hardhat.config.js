require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-ethers");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("solidity-coverage");

const testAccounts = require("./testAccounts.json");

const privateKey = process.env.PRIVATE_KEY;
const infuraKey = process.env.INFURA_KEY;
const alchemyKey = process.env.ALCHEMY_KEY;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  mocha: { timeout: 2000000 },
  networks: {
    localhost: {
      hardfork: "istanbul",
    },
    // hardhat: {
    //   allowUnlimitedContractSize: true,
    //   accounts: testAccounts,
    // },
    hardhat: {
      forking: {
        url: `https://eth-mainnet.alchemyapi.io/v2/${alchemyKey}`,
        blockNumber: 12651421
      }
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${infuraKey}`,
      accounts: [`0x${privateKey}`],
      gas: 8000000,
      gasPrice: 1000000000, // 1gWei
      timeout: 200000,
    },
    kovan: {
      url: `https://kovan.infura.io/v3/${infuraKey}`,
      accounts: [`0x${privateKey}`],
      gas: 8000000,
      gasPrice: 1000000000, // 1gWei
      timeout: 200000,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${infuraKey}`,
      accounts: [`0x${privateKey}`],
      gas: 8000000,
    },
    heco: {
      url: `https://http-mainnet-node.huobichain.com`,
      accounts: [`0x${privateKey}`],
      gas: 8000000,
      gasPrice: 1000000000,
    },
    bsc_test: {
      url: `https://data-seed-prebsc-2-s1.binance.org:8545/`,
      accounts: [`0x${privateKey}`],
      gas: 8000000,
      gasPrice: 20000000000, // 20gWei
    },
    bsc: {
      url: `https://bsc-dataseed.binance.org/`,
      accounts: [`0x${privateKey}`],
      gas: 8000000,
      gasPrice: 10000000000, // 10gWei
    },
  },
  solidity: {
    version: "0.6.12",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  // TODO: there is an unexpected case when tries to verify contracts, so do not use it at now!!!
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY,
  },
  react: {
    providerPriority: ["hardhat", "web3modal"],
  },
  gasReporter: {
    currency: "USD",
    enabled: false,
    coinmarketcap: process.env.COINMARKET_API,
  },
};
