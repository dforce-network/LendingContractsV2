### dForce Lending Contracts

![Github CI](https://github.com/dforce-network/LendingContractsV2/workflows/CI/badge.svg) [![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)

##### Usage

##### Prepare

Install packages:

```
npm install
```

##### Compile

```
npx hardhat compile
```

##### Test

```
npx hardhat test
```

##### Deploy

```
mv .example.env .env
```

_Should edit the `.env` file with your local environment variables._

All parameters in `.example.env` are:

- COINMARKET_API: Optional, only for gas reporter.

- ETHERSCAN_KEY: Optional, to verify contracts automatically.

- INFURA_KEY: Required, infura key to connect to the Ethereum blockchain.

- ALCHEMY_KEY: Required, Alchemy key to connect to the Ethereum blockchain.

- PRIVATE_KEY: Required, the account to deploy the contracts.

- ASSETS: Required, an array that contains underlying tokens to deploy corresponding iTokens.
  _Notice:USDC, has standard interest model and ETH, has non-standard interest model, should be at first_

Before runs the script to deploy contract, should set all underlying tokens address in `config/contractAddresses.js` and corresponding configs in `config/reservesConfigs.js` and `config/commonConfig.js`

```
npx hardhat run scripts/deploy.js --network kovan
```

#### Deployed Addresses

[DeployedAddresses.md](DeployedAddresses.md)

#### Developer Documentation

[https://developers.dforce.network/lend/lend-and-synth](https://developers.dforce.network/lend/lend-and-synth)
