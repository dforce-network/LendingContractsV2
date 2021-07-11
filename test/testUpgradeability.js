const { expect } = require("chai");
const { utils } = require("ethers");
const { loadFixture, fixtureDefault } = require("./helpers/fixtures.js");

const { upgradeProxy, getProxyAdmin } = require("./helpers/utils");

// const ProxyAdmin = require("@openzeppelin/upgrades-core/artifacts/ProxyAdmin.json");
// const AdminUpgradeabilityProxy = require("@openzeppelin/upgrades-core/artifacts/AdminUpgradeabilityProxy.json");
// const { Manifest, getAdminAddress } = require("@openzeppelin/upgrades-core");

// async function getProxyAdminAddress() {
//   const manifest = await Manifest.forNetwork(ethers.provider);
//   const manifestAdmin = await manifest.getAdmin();
//   const proxyAdminAddress = manifestAdmin?.address;

//   return proxyAdminAddress;
// }

describe("Upgradeability", function () {
  let controller,
    iToken0,
    iToken1,
    iToken2,
    iETH,
    owner,
    newOwner,
    rewardDistributor;

  beforeEach(async function () {
    ({
      controller,
      iToken0,
      iToken1,
      iToken2,
      iETH,
      owner,
      accounts,
      priceOracle,
      rewardDistributor,
    } = await loadFixture(fixtureDefault));

    [newOwner] = accounts;
  });

  it("Should be able to update controller implementation", async function () {
    const ControllerV2 = await ethers.getContractFactory("Controller");

    // Get all old V1 markets
    const tokens = await controller.getAlliTokens();
    const markets = await Promise.all(
      tokens.map(async (token) => {
        return await controller.markets(token);
      })
    );

    // console.log(markets);

    const controllerV2 = await upgradeProxy(controller.address, ControllerV2, {
      unsafeAllowCustomTypes: true,
    });

    // Check all tokens
    expect(await controllerV2.getAlliTokens()).to.have.members(tokens);

    // Check the markets configuration
    let marketsV2 = await Promise.all(
      tokens.map(async (token) => {
        return await controller.markets(token);
      })
    );
    expect(marketsV2).to.eql(markets);
  });

  it("Should be able to update iToken implementation", async function () {
    const ITokenV2 = await ethers.getContractFactory("iToken");

    const tokenName = await iToken0.name();
    const totalSupply = await iToken0.totalSupply();

    const iTokenV2 = await upgradeProxy(iToken0.address, ITokenV2, {
      unsafeAllowCustomTypes: true,
    });

    // Check tokenName and totalSupply
    expect(await iTokenV2.name()).to.equal(tokenName);
    expect(await iTokenV2.totalSupply()).to.equal(totalSupply);
  });

  it("Should be able to change the owner of ProxyAdmin", async function () {
    // Deploy the new implementation, preparing for the upgrade
    const ITokenV2 = await ethers.getContractFactory("iToken");
    const iTokenV2 = await ITokenV2.deploy();
    await iTokenV2.deployed();

    const proxyAdmin = await getProxyAdmin();

    // The proxyAdmin has a pending owner
    let newOwnerAddr = await newOwner.getAddress();
    await proxyAdmin._setPendingOwner(newOwnerAddr);
    await proxyAdmin.connect(newOwner)._acceptOwner();

    // Now the old proxyAdmin should not be able to update
    await expect(
      upgradeProxy(iToken0.address, ITokenV2, {
        unsafeAllowCustomTypes: true,
      })
    ).to.be.reverted;

    const iTokenV1 = await proxyAdmin
      .connect(newOwner)
      .getProxyImplementation(iToken0.address);

    // New owner should be able to update
    await proxyAdmin
      .connect(newOwner)
      .upgrade(iToken0.address, iTokenV2.address);

    const newImpl = await proxyAdmin
      .connect(newOwner)
      .getProxyImplementation(iToken0.address);

    expect(newImpl).to.not.equal(iTokenV1.address);
    expect(newImpl).to.equal(iTokenV2.address);
  });

  it("Should be able to change the admin of proxy", async function () {
    // Deploy the new implementation, preparing for the upgrade
    const ITokenV2 = await ethers.getContractFactory("iToken");
    const iTokenV2 = await ITokenV2.deploy();
    await iTokenV2.deployed();

    let newOwnerAddr = await newOwner.getAddress();
    const proxyAdmin = await getProxyAdmin();
    await proxyAdmin.changeProxyAdmin(iToken0.address, newOwnerAddr);

    // Now the old proxyAdmin is not the admin of the proxy
    // Instantiate the Proxy
    const Proxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const proxy = await Proxy.attach(iToken0.address);

    //console.log(proxy);

    const iTokenV1 = await proxy.connect(newOwner).callStatic.implementation();

    // New admin should be able to upgrade
    await proxy.connect(newOwner).upgradeTo(iTokenV2.address);

    const newImpl = await proxy.connect(newOwner).callStatic.implementation();

    expect(newImpl).to.not.equal(iTokenV1.address);
    expect(newImpl).to.equal(iTokenV2.address);
  });
});
