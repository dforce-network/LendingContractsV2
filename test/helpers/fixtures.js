const { utils, BigNumber } = require("ethers");
const { waffle, network } = require("hardhat");
const { createFixtureLoader, deployMockContract } = waffle;
const {
  deployProxy,
  deployProxyWithConstructor,
  txWait,
  setOraclePrices,
} = require("./utils");

const MockPriceOracle = require("../../artifacts/contracts/interface/IPriceOracle.sol/IPriceOracle.json");

// Use ethers provider instead of waffle's default MockProvider
const loadFixture = createFixtureLoader([], ethers.provider);

let oracle;
// const blockSleep = 2;
// const sleepTime = 10000; // 10s
let tx;

const collateralFactor = utils.parseEther("0.9");
const borrowFactor = utils.parseEther("1");
const supplyCapacity = ethers.constants.MaxUint256;
const borrowCapacity = ethers.constants.MaxUint256;
const distributionFactor = utils.parseEther("1");

let reserveRatio = "0.075";
let flashloanFeeRatio = "0.0009";
let protocolFeeRatio = "0.1";

async function setiTokenConfig(
  iToken,
  reserveRatio,
  flashloanFeeRatio,
  protocolFeeRatio
) {
  await iToken._setNewReserveRatio(utils.parseEther(reserveRatio.toString()));
  await iToken._setNewFlashloanFeeRatio(
    utils.parseEther(flashloanFeeRatio.toString())
  );
  await iToken._setNewProtocolFeeRatio(
    utils.parseEther(protocolFeeRatio.toString())
  );
}

async function setPrices(iToken) {
  const [owner, ...accounts] = await ethers.getSigners();
  const decimals = await iToken.decimals();

  // Price based on USD
  const autualFeedingPrice = utils.parseUnits("1", 36 - decimals);

  // Sets price.
  tx = await oracle
    .connect(owner)
    .setPrices([iToken.address], [autualFeedingPrice]);

  await txWait(network.name, tx);
}

async function distributeUnderlying(underlying, iToken) {
  const [owner, ...accounts] = await ethers.getSigners();

  const rawAmount = BigNumber.from("1000000000");
  const decimals = await underlying.decimals();

  let actualAmount = rawAmount.mul(BigNumber.from(10).pow(decimals));

  for (const account of accounts) {
    await underlying.mint(await account.getAddress(), actualAmount);

    await underlying
      .connect(account)
      .approve(iToken.address, ethers.constants.MaxUint256);
  }
}

// Simulate to mine new blocks.
async function increaseBlock(blockNumber) {
  while (blockNumber > 0) {
    blockNumber--;
    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });
  }
}

// Simulate the time passed.
async function increaseTime(time) {
  await hre.network.provider.request({
    method: "evm_increaseTime",
    params: [time],
  });
}

// Get current block number.
async function getBlock() {
  const rawBlockNumber = await hre.network.provider.request({
    method: "eth_blockNumber",
    params: [],
  });
  return parseInt(rawBlockNumber, 16);
}

// Get current chain id
async function getChainId() {
  return hre.network.provider.request({
    method: "eth_chainId",
    params: [],
  });
}

async function setConfigForiToken(
  iToken,
  reserveRatio,
  flashloanFeeRatio,
  protocolFeeRatio
) {
  let currentReserveRatio = await iToken.reserveRatio();
  let toWriteReserveRatio = utils.parseEther(reserveRatio.toString());
  if (currentReserveRatio.toString() != toWriteReserveRatio.toString()) {
    console.log(
      "\ncurrent reserve ratio is:   ",
      currentReserveRatio.toString() / 1e18
    );
    console.log("going to set reserve ratio: ", reserveRatio);
    tx = await iToken._setNewReserveRatio(toWriteReserveRatio);
    await txWait(network.name, tx);
    console.log("finish to set reserve ratio\n");
  }

  let currentFlashloanFeeRatio = await iToken.flashloanFeeRatio();
  let toWriteFlashloanFeeRatio = utils.parseEther(flashloanFeeRatio.toString());
  if (
    currentFlashloanFeeRatio.toString() != toWriteFlashloanFeeRatio.toString()
  ) {
    console.log(
      "\ncurrent flashloan fee ratio is:   ",
      currentFlashloanFeeRatio.toString() / 1e18
    );
    console.log("going to set flashloan fee ratio: ", flashloanFeeRatio);
    tx = await iToken._setNewFlashloanFeeRatio(toWriteFlashloanFeeRatio);
    await txWait(network.name, tx);
    console.log("finish to set flashloan fee ratio\n");
  }

  let currentProtocolFeeRatio = await iToken.protocolFeeRatio();
  let toWriteProtocolFeeRatio = utils.parseEther(protocolFeeRatio.toString());
  if (
    currentProtocolFeeRatio.toString() != toWriteProtocolFeeRatio.toString()
  ) {
    console.log(
      "\ncurrent protocol fee ratio is:   ",
      currentProtocolFeeRatio.toString() / 1e18
    );
    console.log("going to set protocol fee ratio: ", protocolFeeRatio);
    tx = await iToken._setNewProtocolFeeRatio(toWriteProtocolFeeRatio);
    await txWait(network.name, tx);
    console.log("finish to set protocol fee ratio\n");
  }
}

async function deployiToken(
  underlyingAddress,
  iTokenName,
  iTokenSymbol,
  controllerAddress,
  interestRateModelAddress,
  implementationAddress
) {
  const [owner, ...accounts] = await ethers.getSigners();
  const IToken = await ethers.getContractFactory("iToken");
  const iToken = await deployProxy(
    IToken,
    [
      underlyingAddress,
      iTokenName,
      iTokenSymbol,
      controllerAddress,
      interestRateModelAddress,
    ],
    {
      unsafeAllowCustomTypes: true,
      initializer: "initialize",
    },
    implementationAddress
  );

  return { iToken };
}

async function deployiTokenFF(
  underlyingAddress,
  iTokenName,
  iTokenSymbol,
  controllerAddress,
  interestRateModelAddress,
  implementationAddress
) {
  const [owner, ...accounts] = await ethers.getSigners();
  const ITokenFF = await ethers.getContractFactory("iTokenFF");
  const iTokenFF = await deployProxy(
    ITokenFF,
    [
      underlyingAddress,
      iTokenName,
      iTokenSymbol,
      controllerAddress,
      interestRateModelAddress,
    ],
    {
      unsafeAllowCustomTypes: true,
      initializer: "initialize",
    },
    implementationAddress
  );

  return { iTokenFF };
}

async function deployiETH(
  iTokenName,
  iTokenSymbol,
  controllerAddress,
  interestRateModelAddress
) {
  const IETH = await ethers.getContractFactory("iETH");
  const iETH = await deployProxy(
    IETH,
    [
      // underlying.address,
      iTokenName,
      iTokenSymbol,
      controllerAddress,
      interestRateModelAddress,
    ],
    {
      unsafeAllowCustomTypes: true,
      initializer: "initialize",
    }
  );

  return { iETH };
}

// For MSD
async function deployFixedInterestRateModel() {
  const model = await (
    await ethers.getContractFactory("FixedInterestRateModel")
  ).deploy();
  await model.deployed();

  return model;
}

async function deployMSD(name, symbol, decimals, implementationAddress) {
  const MSD = await deployProxy(
    await ethers.getContractFactory("MSD"),
    [name, symbol, decimals],
    {
      initializer: "initialize",
    },
    implementationAddress
  );

  return MSD;
}

async function deployMSDController() {
  const msdController = await deployProxy(
    await ethers.getContractFactory("MSDController"),
    [],
    {
      initializer: "initialize",
    }
  );

  return msdController;
}

async function deployMSDS(
  name,
  symbol,
  underlyingAddress,
  interestRateModelAddress,
  msdControllerAddress,
  implementationAddress
) {
  const MSDS = await deployProxy(
    await ethers.getContractFactory("MSDS"),
    [
      name,
      symbol,
      underlyingAddress,
      interestRateModelAddress,
      msdControllerAddress,
    ],
    {
      initializer: "initialize",
    },
    implementationAddress
  );

  return MSDS;
}

async function deployiMSD(
  name,
  symbol,
  underlyingAddress,
  controllerAddress,
  interestRateModelAddress,
  msdControllerAddress,
  implementationAddress
) {
  const iMSD = await deployProxy(
    await ethers.getContractFactory("iMSD"),
    [
      underlyingAddress,
      name,
      symbol,
      controllerAddress,
      interestRateModelAddress,
      msdControllerAddress,
    ],
    {
      unsafeAllowCustomTypes: true,
      initializer: "initialize",
    },
    implementationAddress
  );

  return iMSD;
}

async function fixtureMSD([wallet, other], provider) {
  const {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
  } = await loadFixture(fixtureiToken);

  const xUSD = await deployMSD("xUSD", "xUSD", 18);

  const config = {
    collateralFactor: utils.parseEther("0.9"),
    borrowFactor: utils.parseEther("1"),
    supplyCapacity: 0,
    borrowCapacity: ethers.constants.MaxUint256,
    distributionFactor: utils.parseEther("1"),
  };

  // Fixed Rate Interest Model
  const fixedInterestRateModel = await deployFixedInterestRateModel();

  const msdController = await deployMSDController();

  const iMUSX = await deployiMSD(
    "iMUSX",
    "iMUSX",
    xUSD.address,
    controller.address,
    fixedInterestRateModel.address,
    msdController.address
  );

  // Set the price
  await setOraclePrices(priceOracle, [iMUSX], [1]);

  const {
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor,
  } = config;

  await controller._addMarket(
    iMUSX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  await controllerV2._addMarket(
    iMUSX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  const xUSDS = await deployMSDS(
    "xUSDS",
    "xUSD Saving",
    xUSD.address,
    fixedInterestRateModel.address,
    msdController.address
  );

  // Add xUSD into MSD Controller's token list
  await msdController._addMSD(xUSD.address, [iMUSX.address, xUSDS.address]);

  // Set msdController as the only minter
  await xUSD._addMinter(msdController.address);

  // 0.03 * 10 ** 18 / 2102400
  let supplyRate = BigNumber.from(14269406392);
  await fixedInterestRateModel._setSupplyRate(xUSDS.address, supplyRate);

  // 0.05 * 10 ** 18 / 2102400
  let borrowRate = BigNumber.from(23782343987);
  await fixedInterestRateModel._setBorrowRate(iMUSX.address, borrowRate);

  return {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    fixedInterestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
    xUSD,
    iMUSX,
    xUSDS,
    msdController,
  };
}

async function fixtureEUR() {
  const {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    fixedInterestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
    xUSD,
    iMUSX,
    xUSDS,
    msdController,
  } = await loadFixture(fixtureMSD);

  const xEUR = await deployMSD("xEUR", "xEUR", 18);

  const config = {
    collateralFactor: utils.parseEther("0.9"),
    borrowFactor: utils.parseEther("1"),
    supplyCapacity: 0,
    borrowCapacity: ethers.constants.MaxUint256,
    distributionFactor: utils.parseEther("1"),
  };

  const iMEUX = await deployiMSD(
    "iMEUX",
    "iMEUX",
    xEUR.address,
    controller.address,
    fixedInterestRateModel.address,
    msdController.address
  );

  // Set the price
  await setOraclePrices(priceOracle, [iMEUX], [1]);

  const {
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor,
  } = config;

  await controller._addMarket(
    iMEUX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  await controllerV2._addMarket(
    iMEUX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  const xEURS = await deployMSDS(
    "xEURS",
    "xEUR Saving",
    xEUR.address,
    fixedInterestRateModel.address,
    msdController.address
  );

  // Add xEUR into MSD Controller's token list
  await msdController._addMSD(xEUR.address, [iMEUX.address, xEURS.address]);

  // Set msdController as the only minter
  await xEUR._addMinter(msdController.address);

  // 0.03 * 10 ** 18 / 2102400
  let supplyRate = BigNumber.from(14269406392);
  await fixedInterestRateModel._setSupplyRate(xEURS.address, supplyRate);

  // 0.05 * 10 ** 18 / 2102400
  let borrowRate = BigNumber.from(23782343987);
  await fixedInterestRateModel._setBorrowRate(iMEUX.address, borrowRate);

  return {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    fixedInterestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
    xUSD,
    iMUSX,
    xUSDS,
    xEUR,
    iMEUX,
    xEURS,
    msdController,
  };
}

async function deployiTokenAndSetConfigs(
  underlyingName,
  underlyingSymbol,
  underlyingDecimals,
  iTokenName,
  iTokenSymbol,
  controller,
  controllerV2,
  interestRateModel,
  addToMarket,
  reserveRatio,
  flashloanFeeRatio,
  protocolFeeRatio
) {
  const ERC20 = await ethers.getContractFactory("Token");
  const underlying = await ERC20.deploy(
    underlyingName,
    underlyingSymbol,
    underlyingDecimals
  );
  await underlying.deployed();

  const { iToken } = await deployiToken(
    underlying.address,
    iTokenName,
    iTokenSymbol,
    controller.address,
    interestRateModel.address
  );

  await setConfigForiToken(
    iToken,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  await distributeUnderlying(underlying, iToken);

  await setPrices(iToken);

  if (addToMarket) {
    await controller._addMarket(
      iToken.address,
      collateralFactor,
      borrowFactor,
      supplyCapacity,
      borrowCapacity,
      distributionFactor
    );

    await controllerV2._addMarket(
      iToken.address,
      collateralFactor,
      borrowFactor,
      supplyCapacity,
      borrowCapacity,
      distributionFactor
    );
  }

  return { underlying, iToken };
}

async function deployiTokenFFAndSetConfigs(
  underlyingName,
  underlyingSymbol,
  underlyingDecimals,
  iTokenName,
  iTokenSymbol,
  controller,
  controllerV2,
  interestRateModel,
  addToMarket,
  reserveRatio,
  flashloanFeeRatio,
  protocolFeeRatio
) {
  const ERC20 = await ethers.getContractFactory("Token");
  const underlying = await ERC20.deploy(
    underlyingName,
    underlyingSymbol,
    underlyingDecimals
  );
  await underlying.deployed();

  const { iTokenFF } = await deployiTokenFF(
    underlying.address,
    iTokenName,
    iTokenSymbol,
    controller.address,
    interestRateModel.address
  );

  await setConfigForiToken(
    iTokenFF,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  await distributeUnderlying(underlying, iTokenFF);

  await setPrices(iTokenFF);

  if (addToMarket) {
    await controller._addMarket(
      iTokenFF.address,
      collateralFactor,
      borrowFactor,
      supplyCapacity,
      borrowCapacity,
      distributionFactor
    );

    await controllerV2._addMarket(
      iTokenFF.address,
      collateralFactor,
      borrowFactor,
      supplyCapacity,
      borrowCapacity,
      distributionFactor
    );
  }

  return { underlying, iTokenFF };
}

async function addiETH(
  iTokenName,
  iTokenSymbol,
  controller,
  controllerV2,
  interestRateModel,
  reserveRatio,
  flashloanFeeRatio,
  protocolFeeRatio
) {
  // const ERC20 = await ethers.getContractFactory("Token");
  // const underlying = await ERC20.deploy(underlyingName, underlyingSymbol, underlyingDecimals);
  // await underlying.deployed();

  const IETH = await ethers.getContractFactory("iETH");
  const { iETH: iETH } = await deployiETH(
    iTokenName,
    iTokenSymbol,
    controller.address,
    interestRateModel.address,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  await setConfigForiToken(
    iETH,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  const [owner, ...accounts] = await ethers.getSigners();

  // Sets price.
  await oracle
    .connect(owner)
    .setPrices([iETH.address], [utils.parseEther("600")]);

  // Need to set price before before add market
  await controller._addMarket(
    iETH.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  await controllerV2._addMarket(
    iETH.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  return { iETH };
}

async function deployRewardDistributor(controller) {
  const [owner, ...accounts] = await ethers.getSigners();
  const RewardDistributor = await ethers.getContractFactory(
    "RewardDistributorV3"
  );

  const rewardDistributor = await deployProxy(
    RewardDistributor,
    [controller.address],
    {
      unsafeAllowCustomTypes: true,
      initializer: "initialize",
    }
  );

  await controller._setRewardDistributor(rewardDistributor.address);

  return { rewardDistributor };
}

async function deployControllerV2(proxyAdminAddress) {
  const Controller = await ethers.getContractFactory("ControllerV2");

  const controllerV2 = await deployProxy(Controller, [], {
    unsafeAllowCustomTypes: true,
    initializer: "initialize",
  });

  return { controllerV2 };
}

async function fixtureDeployController(proxyAdminAddress) {
  const Controller = await ethers.getContractFactory("Controller");

  const controller = await deployProxy(Controller, [], {
    unsafeAllowCustomTypes: true,
    initializer: "initialize",
  });

  return { controller };
}

// Deploys the actually price oracle contract.
async function fixtureDeployOracle(posterAddress, maxSwing) {
  const [owner, ...accounts] = await ethers.getSigners();
  const Oracle = await ethers.getContractFactory("PriceOracle");
  oracle = await Oracle.deploy(
    posterAddress,
    utils.parseEther(maxSwing.toString())
  );
  await oracle.deployed();
  tx = oracle.deployTransaction;

  await txWait(network.name, tx);

  return oracle;
}

// Deploy status oracle.
async function fixtureDeployStatusOracle(pauser, timeZone, openTime, duration) {
  const StatusOracle = await ethers.getContractFactory("StatusOracle");
  let statusOracle = await StatusOracle.deploy(
    pauser,
    timeZone,
    openTime,
    duration
  );
  await statusOracle.deployed();
  tx = statusOracle.deployTransaction;

  await txWait(network.name, tx);

  return statusOracle;
}

// Deploys the mock aggregator contract.
async function deployMockAggregator() {
  const MockAggregator = await ethers.getContractFactory("MockAggregator");
  aggregator = await MockAggregator.deploy();
  await aggregator.deployed();
  tx = aggregator.deployTransaction;

  await txWait(network.name, tx);

  return aggregator;
}

// Deploys the ExchangeRateModel contract.
async function deployExchangeRateModel(token) {
  const GOLDxExchangeRateModel = await ethers.getContractFactory(
    "GOLDxExchangeRateModel"
  );
  const exchangeRateModel = await GOLDxExchangeRateModel.deploy(token);
  await exchangeRateModel.deployed();
  tx = exchangeRateModel.deployTransaction;

  await txWait(network.name, tx);

  return exchangeRateModel;
}

// Deploys the MockGOLDx contract.
async function deployMockGOLDx() {
  const MockGOLDx = await ethers.getContractFactory("MockGOLDx");
  const GOLDx = await MockGOLDx.deploy();
  await GOLDx.deployed();
  tx = GOLDx.deployTransaction;

  await txWait(network.name, tx);

  return GOLDx;
}

// deploys stablecoin intereset rate model contract.
async function fixtureDeployStablecoinInterestRateModel() {
  const StablecoinInterestRateModel = await ethers.getContractFactory(
    "StablecoinInterestRateModel"
  );
  const stablecoinInterestRateModel = await StablecoinInterestRateModel.deploy();
  await stablecoinInterestRateModel.deployed();
  tx = stablecoinInterestRateModel.deployTransaction;

  await txWait(network.name, tx);

  return stablecoinInterestRateModel;
}

// deploys non-stablecoin interest rate model contract.
async function fixtureDeployNonStablecoinInterestRateModel(threshold) {
  const NonStablecoinInterestRateModel = await ethers.getContractFactory(
    "StandardInterestRateModel"
  );
  const nonstablecoinInterestRateModel = await NonStablecoinInterestRateModel.deploy(
    utils.parseEther(threshold.toString())
  );
  await nonstablecoinInterestRateModel.deployed();
  tx = nonstablecoinInterestRateModel.deployTransaction;

  await txWait(network.name, tx);

  return nonstablecoinInterestRateModel;
}

// deploys interest rate model contract.
async function fixtureDeployInterestRateModel(
  baseInterestPerYear,
  interestPerYear,
  highInterestPerYear,
  high
) {
  const [owner, ...accounts] = await ethers.getSigners();
  const InterestRateModel = await ethers.getContractFactory(
    "InterestRateModel"
  );
  const interestRateModel = await InterestRateModel.deploy(
    utils.parseEther(baseInterestPerYear.toString()),
    utils.parseEther(interestPerYear.toString()),
    utils.parseEther(highInterestPerYear.toString()),
    utils.parseEther(high.toString())
  );
  await interestRateModel.deployed();
  tx = interestRateModel.deployTransaction;

  await txWait(network.name, tx);

  return interestRateModel;
}

// deploys lending data contract.
async function fixtureDeployLendingData(
  controlleAddress,
  anchorPriceToken,
  blocksPerYear,
  implementationAddress,
  constructorArguments
) {
  let LendingData, initializerArguments;

  if (constructorArguments.length != 2 && constructorArguments.length != 3) {
    console.log("Please check the lending data parameters for constructor!");
    return;
  }
  if (constructorArguments.length == 2) {
    LendingData = await ethers.getContractFactory("LendingData");
    initializerArguments = [controlleAddress, anchorPriceToken];
  }

  if (constructorArguments.length == 3) {
    LendingData = await ethers.getContractFactory("LendingDataV2");
    initializerArguments = [controlleAddress, anchorPriceToken, blocksPerYear];
  }

  console.log("Deploy proxy with constructor");

  let lendingData = await deployProxyWithConstructor(
    LendingData,
    initializerArguments,
    {
      unsafeAllowCustomTypes: true,
      initializer: "initialize",
    },
    implementationAddress,
    constructorArguments
  );

  return lendingData;
}

async function fixtureMarketsAdded([wallet, other], provider) {
  const [owner, ...accounts] = await ethers.getSigners();
  const { controller } = await loadFixture(fixtureDeployController);

  const { controllerV2 } = await deployControllerV2();

  const interestRateModel = await fixtureDeployInterestRateModel(
    0,
    0.08,
    1,
    0.75
  );

  const priceOracle = await fixtureDeployOracle(owner.getAddress(), "0.01");
  await controller._setPriceOracle(priceOracle.address);
  await controllerV2._setPriceOracle(priceOracle.address);

  // Reward Distributor
  let rewardDistributor = (await deployRewardDistributor(controller))
    .rewardDistributor;

  await deployRewardDistributor(controllerV2);

  const {
    underlying: underlying0,
    iToken: iToken0,
  } = await deployiTokenAndSetConfigs(
    "USDx Token",
    "USDx",
    18,
    "dForce lending token USDx",
    "iToken USDx",
    controller,
    controllerV2,
    interestRateModel,
    true,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
    );

  const {
    underlying: underlying1,
    iToken: iToken1,
  } = await deployiTokenAndSetConfigs(
    "USDT Token",
    "USDT",
    6,
    "dForce lending token USDT",
    "iToken USDT",
    controller,
    controllerV2,
    interestRateModel,
    true,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  const {
    underlying: underlying2,
    iToken: iToken2,
  } = await deployiTokenAndSetConfigs(
    "WBTC Token",
    "WBTC",
    8,
    "dForce lending token WBTC",
    "iToken WBTC",
    controller,
    controllerV2,
    interestRateModel,
    true,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  const { iETH: iETH } = await addiETH(
    "dForce lending ETH",
    "iETH",
    controller,
    controllerV2,
    interestRateModel,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  const {
    underlying: underlying3,
    iToken: iToken3,
  } = await deployiTokenAndSetConfigs(
    "xTSLA Token",
    "xTSLA",
    18,
    "dForce lending token xTSLA",
    "ixTSLA",
    controller,
    controllerV2,
    interestRateModel,
    true,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  const {
    underlying: underlying4,
    iToken: iToken4,
  } = await deployiTokenAndSetConfigs(
    "xAPPL Token",
    "xAPPL",
    18,
    "dForce lending token xAPPL",
    "ixAPPL",
    controller,
    controllerV2,
    interestRateModel,
    true,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
    );

  const {
    underlying: underlying5,
    iTokenFF: iToken5,
  } = await deployiTokenFFAndSetConfigs(
    "USDx Token",
    "USDx",
    18,
    "dForce lending token USDx that can enter market",
    "iToken USDx ",
    controller,
    controllerV2,
    interestRateModel,
    true,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  return {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    priceOracle,
    rewardDistributor,
  };
}

async function fixtureiToken([wallet, other], provider) {
  const {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    priceOracle,
    rewardDistributor,
  } = await loadFixture(fixtureMarketsAdded);
  const [owner, ...accounts] = await ethers.getSigners();

  // Deploys lending data contract.
  const lendingData = await fixtureDeployLendingData(
    controller.address,
    iToken0.address,
    0,
    "",
    [controller.address, iToken0.address]
  );

  // TODO: remove out: flashloan executor.
  // Deploys flashloan executor contract.
  const FlashloanExecutor = await ethers.getContractFactory(
    "FlashloanExecutor"
  );
  const flashloanExecutor = await FlashloanExecutor.deploy();
  await flashloanExecutor.deployed();

  // Deploys a bad flashloan executor contract.
  const FlashloanExecutorFailure = await ethers.getContractFactory(
    "FlashloanExecutorFailure"
  );
  const flashloanExecutorFailure = await FlashloanExecutorFailure.deploy();
  await flashloanExecutorFailure.deployed();

  // Init Mock Price Oracle
  const mockPriceOracle = await deployMockContract(owner, MockPriceOracle.abi);

  await setOraclePrices(mockPriceOracle, [iToken0, iToken1, iETH], [1, 1, 600]);

  // Init close factor
  let closeFactor = utils.parseUnits("0.5", 18);
  await controller._setCloseFactor(closeFactor);
  await controllerV2._setCloseFactor(closeFactor);

  // Init liquidation incentive
  let liquidationIncentive = utils.parseUnits("1.1", 18);
  await controller._setLiquidationIncentive(liquidationIncentive);
  await controllerV2._setLiquidationIncentive(liquidationIncentive);

  return {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
  };
}

async function fixtureShortfall([wallet, other], provider) {
  const {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    interestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    priceOracle,
  } = await loadFixture(fixtureDefault);

  const [user0, user1] = accounts;
  const account0 = await user0.getAddress();
  const account1 = await user1.getAddress();
  let rawAmount = BigNumber.from("1000");
  const iToken0Decimals = await iToken0.decimals();
  const iToken1Decimals = await iToken1.decimals();
  let mintiToken0Amount = rawAmount.mul(
    BigNumber.from(10).pow(iToken0Decimals)
  );
  let mintiToken1Amount = rawAmount.mul(
    BigNumber.from(10).pow(iToken1Decimals)
  );
  let amount = mintiToken0Amount;

  // Use mock oracle
  await controller._setPriceOracle(mockPriceOracle.address);
  await controllerV2._setPriceOracle(mockPriceOracle.address);

  await iToken0.connect(user0).mint(account0, amount);
  await iToken1.connect(user1).mint(account1, mintiToken1Amount);

  // User use iToken0 as collateral, and borrow some underlying1
  await controller
    .connect(user0)
    .enterMarkets([iToken0.address, iToken1.address]);

  await controllerV2
    .connect(user0)
    .enterMarkets([iToken0.address, iToken1.address]);

  await iToken1.connect(user0).borrow(mintiToken1Amount.div(2).mul(9).div(10));

  // underlying0 price drop to 0.5
  await setOraclePrices(mockPriceOracle, [iToken0], [0.5]);

  return {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    interestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    priceOracle,
  };
}

async function getiTokenCurrentData(iTokenContract, increaseblock = 0) {
  let accrualBlockNumber = ethers.BigNumber.from(await getBlock()).add(
    ethers.BigNumber.from(increaseblock)
  );
  let borrowRate = await iTokenContract.borrowRatePerBlock();
  let simpleInterestFactor = borrowRate.mul(
    accrualBlockNumber.sub(await iTokenContract.accrualBlockNumber())
  );

  let totalBorrows = await iTokenContract.totalBorrows();
  let base = ethers.utils.parseEther("1");
  let interestAccumulated = simpleInterestFactor.mul(totalBorrows).div(base);
  totalBorrows = interestAccumulated.add(totalBorrows);

  let totalReserves = await iTokenContract.totalReserves();
  let reserveRatio = await iTokenContract.reserveRatio();
  totalReserves = reserveRatio
    .mul(interestAccumulated)
    .div(base)
    .add(totalReserves);

  let borrowIndex = await iTokenContract.borrowIndex();
  borrowIndex = simpleInterestFactor
    .mul(borrowIndex)
    .div(base)
    .add(borrowIndex);

  let totalSupply = await iTokenContract.totalSupply();
  let cash = await iTokenContract.getCash();
  let exchangeRate =
    totalSupply.toString() == "0"
      ? base
      : cash.add(totalBorrows).sub(totalReserves).mul(base).div(totalSupply);

  return {
    cash,
    borrowRate,
    accrualBlockNumber,
    totalSupply,
    totalBorrows,
    totalReserves,
    exchangeRate,
    borrowIndex,
    interestAccumulated,
  };
}

async function fixtureDefault([wallet, other], provider) {
  const {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    fixedInterestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
    xUSD,
    iMUSX,
    xUSDS,
    xEUR,
    iMEUX,
    xEURS,
    msdController,
  } = await loadFixture(fixtureEUR);

  // Deploy new iToken that uses USX as the underlying.
  const iUSX = (
    await deployiToken(
      xUSD.address,
      "dForce iUSX",
      "iUSX",
      controller.address,
      interestRateModel.address
    )
  ).iToken;

  await setConfigForiToken(
    iUSX,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  await setPrices(iUSX);

  await controller._addMarket(
    iUSX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  await controllerV2._addMarket(
    iUSX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  // Deploy new iToken that uses EUX as the underlying.
  const iEUX = (
    await deployiToken(
      xEUR.address,
      "dForce iEUX",
      "iEUX",
      controller.address,
      interestRateModel.address
    )
  ).iToken;

  await setConfigForiToken(
    iEUX,
    reserveRatio,
    flashloanFeeRatio,
    protocolFeeRatio
  );

  await setPrices(iEUX);

  await controller._addMarket(
    iEUX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  await controllerV2._addMarket(
    iEUX.address,
    collateralFactor,
    borrowFactor,
    supplyCapacity,
    borrowCapacity,
    distributionFactor
  );

  return {
    controller,
    controllerV2,
    iToken0,
    underlying0,
    iToken1,
    underlying1,
    iToken2,
    underlying2,
    iToken3,
    underlying3,
    iToken4,
    underlying4,
    iToken5,
    underlying5,
    iETH,
    interestRateModel,
    fixedInterestRateModel,
    mockPriceOracle,
    owner,
    accounts,
    flashloanExecutor,
    flashloanExecutorFailure,
    priceOracle,
    rewardDistributor,
    lendingData,
    xUSD,
    iMUSX,
    iUSX,
    xUSDS,
    xEUR,
    iMEUX,
    iEUX,
    xEURS,
    msdController,
  };
}

module.exports = {
  deployiETH,
  deployiToken,
  deployiTokenFF,
  deployiTokenAndSetConfigs,
  deployRewardDistributor,
  deployMSD,
  deployMSDController,
  deployiMSD,
  deployMSDS,
  deployFixedInterestRateModel,
  deployMockAggregator,
  deployExchangeRateModel,
  deployMockGOLDx,
  fixtureDefault,
  fixtureDeployController,
  fixtureDeployInterestRateModel,
  fixtureDeployStablecoinInterestRateModel,
  fixtureDeployNonStablecoinInterestRateModel,
  fixtureDeployOracle,
  fixtureDeployStatusOracle,
  fixtureMarketsAdded,
  fixtureShortfall,
  fixtureDeployLendingData,
  getiTokenCurrentData,
  getBlock,
  getChainId,
  increaseBlock,
  increaseTime,
  setConfigForiToken,
  loadFixture,
};
