const { expect, use } = require("chai");
const { utils, BigNumber } = require("ethers");
const { upgrades, network, block } = require("hardhat");

const allCommonConfigs = require("../../config/commonConfig.js");
const commonConfigs = allCommonConfigs[network.name];

const USE_HARDHAT_UPGRADES = false;

const BASE = ethers.utils.parseEther("1");
const blockSleep = 2;
const sleepTime = 5000; // 5s
let tx;

async function verifyOnlyOwner(
  contract,
  method,
  args,
  owner,
  other,
  ownerEvent = "",
  ownerEventArgs = [],
  ownerChecks = async () => {},
  nonownerChecks = async () => {}
) {
  // execute the non-owner case first as it does not change state
  await expect(contract.connect(other)[method](...args)).to.be.revertedWith(
    "onlyOwner: caller is not the owner"
  );

  await nonownerChecks();

  // exxcute the owner call
  if (ownerEvent !== "") {
    await expect(contract.connect(owner)[method](...args))
      .to.emit(contract, ownerEvent)
      .withArgs(...ownerEventArgs);
  } else {
    await contract.connect(owner)[method](...args);
  }

  await ownerChecks();
}

// Convert any raw ether value into wei based on the decimals of the token.
// eg: parseTokenAmount(iToken, 100) => 100 * 10 ** 18
async function parseTokenAmount(token, amount) {
  return utils.parseUnits(amount.toString(), await token.decimals());
}

async function formatTokenAmount(token, amount) {
  return utils.formatUnits(amount, await token.decimals());
}

async function formatToHumanReadable(number) {
  return number.toString() / BASE.toString();
}

function isMockPriceOrace(oracle) {
  return !oracle.functions.hasOwnProperty("poster");
}

async function convertToOraclePrice(iToken, price) {
  let decimals = await iToken.decimals();

  // Price based on USD
  return utils.parseUnits(price.toString(), 36 - decimals);
}

async function setMockOraclePrices(mockPriceOracle, iTokens, prices, status) {
  for (let index = 0; index < prices.length; index++) {
    const iToken = iTokens[index];
    let tokenPrice = await convertToOraclePrice(iToken, prices[index]);

    await mockPriceOracle.mock.getUnderlyingPrice
      .withArgs(iToken.address)
      .returns(tokenPrice);

    let assetStatus = true;
    if (status.length != 0) {
      assetStatus = status[index];
    }

    await mockPriceOracle.mock.getUnderlyingPriceAndStatus
      .withArgs(iToken.address)
      .returns(tokenPrice, assetStatus);
  }
}

async function setOraclePrices(oracle, iTokens, prices, status = []) {
  if (isMockPriceOrace(oracle)) {
    await setMockOraclePrices(oracle, iTokens, prices, status);
  } else {
    await setRealOraclePrices(oracle, iTokens, prices, status);
  }
}

async function setRealOraclePrices(oracle, iTokens, prices, status) {
  const [owner] = await ethers.getSigners();

  let tokenAddressList = [];
  let tokenPrices = [];
  for (let index = 0; index < prices.length; index++) {
    const iToken = iTokens[index];
    let tokenPrice = await convertToOraclePrice(iToken, prices[index]);

    await oracle.connect(owner)._setPendingAnchor(iToken.address, tokenPrice);

    tokenPrices.push(tokenPrice);
    tokenAddressList.push(iTokens[index].address);

    // TODO: Set asset status

    // const name = await iToken.name();
    // console.log(
    //   name,
    //   "current Price: ",
    //   (await oracle.getUnderlyingPrice(iToken.address)).toString(),
    //   "about to feed Price: ",
    //   tokenPrice.toString()
    // );
  }

  await oracle.connect(owner).setPrices(tokenAddressList, tokenPrices);
}

function verifyAllowError(value0, value1, errorFactor) {
  // For 0 values no error allowed
  if (value0.isZero() || value1.isZero()) {
    expect(Number(value0.toString())).to.closeTo(
      Number(value1.toString()),
      10000
    );
    return;
  }

  let ratio = parseFloat(
    utils.formatEther(value0.mul(utils.parseEther("1")).div(value1))
  );

  expect(ratio).to.be.closeTo(1.0, errorFactor);
}

// Math function
function rmul(a, b) {
  return a.mul(b).div(BASE);
}

function rdiv(a, b) {
  return a.mul(BASE).div(b);
}

function divup(a, b) {
  return a.add(b.sub(1)).div(b);
}

function rdivup(a, b) {
  return divup(a.mul(BASE), b);
}

function getInitializerData(ImplFactory, args, initializer) {
  if (initializer === false) {
    return "0x";
  }

  const allowNoInitialization = initializer === undefined && args.length === 0;
  initializer = initializer ?? "initialize";

  try {
    const fragment = ImplFactory.interface.getFunction(initializer);
    return ImplFactory.interface.encodeFunctionData(fragment, args);
  } catch (e) {
    if (e instanceof Error) {
      if (allowNoInitialization && e.message.includes("no matching function")) {
        return "0x";
      }
    }
    throw e;
  }
}

let proxyAdmin = { address: "" };

// When uses script to deploy contract,
// - if does not set `proxyAdmin` in the`config/commonConfig.js`,
//   deploys a new proxy admin contract, and then for all following proxy contracts,
//   use the same proxy admin contract.
// - if sets, then reads from the config and uses it.
async function getProxyAdmin() {
  if (proxyAdmin.address) {
    return proxyAdmin;
  } else if (
    network.name != "hardhat" &&
    network.name != "localhost" &&
    commonConfigs.proxyAdmin
  ) {
    return {
      address: commonConfigs.proxyAdmin,
    };
  }
  const [owner, ...accounts] = await ethers.getSigners();

  const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
  proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  tx = proxyAdmin.deployTransaction;
  await txWait(network.name, tx);

  return proxyAdmin;
}

async function deployProxyInternal(
  contractFactory,
  args,
  params,
  implAddress
) {
  console.log("Implementation deployed at: ", implAddress);

  const data = getInitializerData(contractFactory, args, params.initializer);
  const adminAddress = (await getProxyAdmin()).address;

  console.log("Proxy Admin deployed at: ", adminAddress);

  const Proxy = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await Proxy.deploy(implAddress, adminAddress, data);
  await proxy.deployed();
  tx = proxy.deployTransaction;

  await txWait(network.name, tx);

  console.log("Proxy deployed at: ", proxy.address);

  const contract = contractFactory.attach(proxy.address);

  // console.log(contract);

  return contract;
}

async function myDeployProxyWithConstructor(
  contractFactory,
  args,
  params,
  implementationAddress,
  constructorArguments
) {
  let impl;
  const [owner, ...accounts] = await ethers.getSigners();
  if (implementationAddress == "") {
    impl = await contractFactory.deploy(...constructorArguments);
    await impl.deployed();
    tx = impl.deployTransaction;
    await txWait(network.name, tx);
  } else {
    impl = { address: implementationAddress };
  }

  proxy = deployProxyInternal(contractFactory, args, params, impl.address);

  return proxy;
}

async function myDeployProxy(
  contractFactory,
  args,
  params,
  implementationAddress
) {
  let impl;
  const [owner, ...accounts] = await ethers.getSigners();
  if (!implementationAddress) {
    impl = await contractFactory.deploy();
    await impl.deployed();
    tx = impl.deployTransaction;
    await txWait(network.name, tx);
    // call initialize() in the implementation conttract
    tx = await impl.initialize(...args);
    await txWait(network.name, tx);
  } else {
    impl = { address: implementationAddress };
  }

  proxy = deployProxyInternal(contractFactory, args, params, impl.address);

  return proxy
}

async function myUpgradeProxy(proxyAddress, contractFactory) {
  const admin = await getProxyAdmin();

  const nextImpl = await contractFactory.deploy();
  await nextImpl.deployed();

  await admin.upgrade(proxyAddress, nextImpl.address);

  return contractFactory.attach(proxyAddress);
}

async function deployProxyWithConstructor(
  contractFactory,
  args,
  params,
  implementationAddress,
  constructorArguments
) {
  return await myDeployProxyWithConstructor(
    contractFactory,
    args,
    params,
    implementationAddress,
    constructorArguments
  );
}

async function deployProxy(
  contractFactory,
  args,
  params,
  implementationAddress
) {
  if (USE_HARDHAT_UPGRADES) {
    return await upgrades.deployProxy(contractFactory, args, params);
  } else {
    return await myDeployProxy(
      contractFactory,
      args,
      params,
      implementationAddress
    );
  }
}

async function upgradeProxy(proxyAddress, contractFactory, params) {
  if (USE_HARDHAT_UPGRADES) {
    return await upgrades.upgradeProxy(proxyAddress, contractFactory, params);
  } else {
    return await myUpgradeProxy(proxyAddress, contractFactory, params);
  }
}

async function txWait(network, tx) {
  if (network != "hardhat" && network != "localhost") {
    await sleep(sleepTime);
    await tx.wait(blockSleep);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(), ms));
}

async function msdEquityPerBlock(iMSD, MSDS) {
  let earning = rmul(
    await iMSD.totalBorrows(),
    await iMSD.borrowRatePerBlock()
  );
  let debt = rmul(
    await MSDS.totalSupply(),
    rmul(await MSDS.exchangeRateStored(), await MSDS.supplyRatePerBlock())
  );

  return earning.sub(debt);
}

module.exports = {
  verifyOnlyOwner,
  setOraclePrices,
  parseTokenAmount,
  formatTokenAmount,
  formatToHumanReadable,
  verifyAllowError,
  deployProxyWithConstructor,
  deployProxy,
  upgradeProxy,
  getProxyAdmin,
  rmul,
  rdiv,
  divup,
  rdivup,
  sleep,
  txWait,
  msdEquityPerBlock,
};
