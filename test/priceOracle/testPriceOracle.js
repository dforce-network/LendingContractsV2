const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  fixtureDefault,
  deployMockAggregator,
  deployExchangeRateModel,
  deployMockGOLDx,
} = require("../helpers/fixtures.js");

const zeroAddress = ethers.constants.AddressZero;
const zero = ethers.utils.parseUnits("0", "wei");

let iToken, iETH, Token, iGOLDx, GOLDx;
let Tokens = {};
let iTokenAggregator, iETHAggregator, TokenAggregator, iGOLDxAggregator;
let Aggregators = {};
let Oracle;
let exchangeRateModel = {};
let users, user1, user2, user3, owner;
let iTokenDecimals, iETHDecimals, tokenDecimals;
let iTokenPrice, iETHPrice, tokenPrice, GOLDxPrice;

describe("PriceOracle", function () {
  async function init() {
    ({
      owner: owner,
      iToken1: iToken,
      iETH: iETH,
      accounts: users,
      priceOracle: Oracle,
    } = await loadFixture(fixtureDefault));

    const ERC20 = await ethers.getContractFactory("Token");
    Token = await ERC20.deploy("dForce", "Token", 8);
    await Token.deployed();

    iGOLDx = await ERC20.deploy("dForce", "GOLDx", 18);
    await iGOLDx.deployed();

    Tokens[iToken.address] = iToken;
    Tokens[iETH.address] = iETH;
    Tokens[Token.address] = Token;
    Tokens[iGOLDx.address] = iGOLDx;

    [user1, user2, user3] = users;
    // iTokenDecimals = await iToken.decimals();
    // iETHDecimals = await iETH.decimals();
    // tokenDecimals = await Token.decimals();

    iTokenAggregator = await deployMockAggregator();
    iETHAggregator = await deployMockAggregator();
    TokenAggregator = await deployMockAggregator();
    iGOLDxAggregator = await deployMockAggregator();
    await iTokenAggregator.setDecimals("8");
    await iETHAggregator.setDecimals("11");
    await TokenAggregator.setDecimals("13");
    await iGOLDxAggregator.setDecimals("18");
    Aggregators[iToken.address] = iTokenAggregator;
    Aggregators[iETH.address] = iETHAggregator;
    Aggregators[Token.address] = TokenAggregator;
    Aggregators[iGOLDx.address] = iGOLDxAggregator;

    iTokenPrice = "0.99887";
    iETHPrice = "1789.99887";
    tokenPrice = "57860.99887";
    GOLDxPrice = "1770.564564";
    let prices = [iTokenPrice, iETHPrice, tokenPrice, GOLDxPrice];
    await setPrices([iToken, iETH, Token, iGOLDx], prices);

    GOLDx = await deployMockGOLDx();
    exchangeRateModel[iGOLDx.address] = await deployExchangeRateModel(
      GOLDx.address
    );

    await Oracle.connect(owner).setExchangeRate(
      iGOLDx.address,
      exchangeRateModel[iGOLDx.address].address,
      ethers.utils.parseUnits("604800", "wei")
    );
  }

  async function setPrices(tokenContracts, prices) {
    let tokenAddressList = [];
    let tokenPrices = [];
    for (let index = 0; index < prices.length; index++) {
      let tokenPrice = await convertOraclePrice(
        tokenContracts[index],
        prices[index]
      );
      tokenPrices.push(tokenPrice);
      tokenAddressList.push(tokenContracts[index].address);

      await Oracle.connect(owner)._setPendingAnchor(
        tokenContracts[index].address,
        tokenPrice
      );
      let aggregator = Aggregators[tokenContracts[index].address];
      await aggregator.setLatestAnswer(
        await convertAggregatorPrice(aggregator, prices[index])
      );
    }
    await Oracle.connect(owner).setPrices(tokenAddressList, tokenPrices);
  }

  // generate a random number.
  function random(min, max) {
    let res = (Math.random() * (max - min) + min).toString();
    let length = res.indexOf(".") + 7;
    res = res
      .slice(0, length >= res.length ? res.length : length)
      .replace(/(0+)$/g, "");
    return res.slice(-1) == "." ? res + "00" : res;
  }

  function randomNum(minNum, maxNum) {
    switch (arguments.length) {
      case 1:
        return parseInt(Math.random() * minNum + 1, 10);
        break;
      case 2:
        return parseInt(Math.random() * (maxNum - minNum + 1) + minNum, 10);
        break;
      default:
        return 0;
        break;
    }
  }

  async function convertOraclePrice(tokenContract, price) {
    let decimals = await tokenContract.decimals();
    return ethers.utils
      .parseUnits(price, "mwei")
      .mul(
        ethers.utils
          .parseUnits("10", "wei")
          .pow(ethers.utils.parseUnits("30", "wei").sub(decimals))
      );
  }

  async function convertAggregatorPrice(aggregatorContract, price) {
    let decimals = await aggregatorContract.decimals();
    return ethers.utils
      .parseUnits(price, "gwei")
      .mul(ethers.utils.parseUnits("10", "wei").pow(decimals))
      .div(ethers.utils.parseUnits("1", "gwei"));
  }

  async function checkOraclePrice(tokenAddress) {
    let tokenContract = Tokens[tokenAddress];
    let tokenDecimals = await tokenContract.decimals();

    let aggregatorContract = Aggregators[tokenAddress];
    let aggregatorDecimals = await aggregatorContract.decimals();
    let aggregatorPrice = await aggregatorContract.latestAnswer();

    let oraclePrice = await Oracle.getUnderlyingPrice(tokenAddress);
    let oracleAggregatorPrice = await Oracle.getAssetAggregatorPrice(
      tokenAddress
    );
    let readerPrice = await Oracle.getReaderPrice(tokenAddress);
    let exchangeRateInfo = await Oracle.getExchangeRateInfo(tokenAddress, zero);

    if (
      (await Oracle.aggregator(tokenAddress)) != zeroAddress &&
      oracleAggregatorPrice.gt(zero)
    ) {
      expect(readerPrice).to.equal(oracleAggregatorPrice);
      if (exchangeRateInfo[1] == zeroAddress) {
        expect(oraclePrice).to.equal(oracleAggregatorPrice);
        expect(oraclePrice).to.equal(readerPrice);
      } else {
        expect(oraclePrice).to.equal(
          oracleAggregatorPrice
            .mul(exchangeRateInfo[4])
            .div(exchangeRateInfo[3])
        );
        expect(oraclePrice).to.equal(
          readerPrice.mul(exchangeRateInfo[4]).div(exchangeRateInfo[3])
        );
        aggregatorPrice = aggregatorPrice
          .mul(exchangeRateInfo[4])
          .div(exchangeRateInfo[3]);
      }
      oraclePrice = oraclePrice.div(
        ethers.utils
          .parseUnits("10", "wei")
          .pow(
            ethers.utils
              .parseUnits("36", "wei")
              .sub(tokenDecimals)
              .sub(aggregatorDecimals)
          )
      );
      expect(aggregatorPrice).to.equal(oraclePrice);
    } else if ((await Oracle.aggregator(tokenAddress)) != zeroAddress) {
      expect(oraclePrice).to.equal(readerPrice);
      expect(oracleAggregatorPrice).to.equal(zero);
    }
  }

  describe("Test PriceOracle all scenarios for aggregator", async function () {
    it("Initialize and check data", async function () {
      await init();

      for (const assetAddress in Tokens) {
        await checkOraclePrice(assetAddress);
      }
    });

    it("Asset use aggregator price", async function () {
      let assetList = [
        Token.address,
        iETH.address,
        iToken.address,
        iGOLDx.address,
      ];
      let aggregatorList = [
        Aggregators[Token.address].address,
        Aggregators[iETH.address].address,
        Aggregators[iToken.address].address,
        Aggregators[iGOLDx.address].address,
      ];
      await Oracle.connect(owner)._setAssetAggregatorBatch(
        assetList,
        aggregatorList
      );
      for (const assetAddress in Tokens) {
        await checkOraclePrice(assetAddress);
      }
    });

    it("No aggregator is set for an asset", async function () {
      await Oracle.connect(owner)._disableAssetAggregator(Token.address);
      await checkOraclePrice(Token.address);
    });

    it("An asset aggregator price is abnormal", async function () {
      // Aggregator price is 0
      await iTokenAggregator.connect(owner).setLatestAnswer(zero);
      await checkOraclePrice(iToken.address);

      // Aggregator price is less than 0
      await iETHAggregator
        .connect(owner)
        .setLatestAnswer(zero.sub(ethers.utils.parseEther("1")));
      await checkOraclePrice(iETH.address);
    });

    it("Check the data when the asset has an exchange rate model", async function () {
      data = await GOLDx.setUnit(ethers.utils.parseEther(random(20, 31)));
      await Oracle.connect(owner).setExchangeRate(
        iGOLDx.address,
        exchangeRateModel[iGOLDx.address].address,
        ethers.utils.parseUnits("604800", "wei")
      );
      await checkOraclePrice(iGOLDx.address);
    });
  });

  describe("Random test PriceOracle all scenarios", async function () {
    it("Check relevant data for PriceOracle", async function () {
      let tokenAddressList = [iToken, iETH, Token, iGOLDx];
      condition = 10;
      while (condition > 0) {
        let tokenAddress =
          tokenAddressList[randomNum(0, tokenAddressList.length - 1)].address;
        await Oracle.connect(owner)._disableAssetAggregator(tokenAddress);

        tokenAddress =
          tokenAddressList[randomNum(0, tokenAddressList.length - 1)].address;
        if ((await Oracle.aggregator(tokenAddress)) == zeroAddress)
          await Oracle.connect(owner)._setAssetAggregator(
            tokenAddress,
            Aggregators[tokenAddress].address
          );

        iTokenPrice = random(0.999, 1.06);
        iETHPrice = random(1750, 1900);
        tokenPrice = random(57000, 59000);
        GOLDxPrice = random(1700, 1800);
        let prices = [iTokenPrice, iETHPrice, tokenPrice, GOLDxPrice];
        await setPrices(tokenAddressList, prices);

        for (const assetAddress in Tokens) {
          await checkOraclePrice(assetAddress);
        }
        condition--;
      }
    });
  });
});
