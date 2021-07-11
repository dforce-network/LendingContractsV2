const { expect } = require("chai");
const { utils } = require("ethers");
const {
  loadFixture,
  fixtureDefault,
  fixtureShortfall,
} = require("../helpers/fixtures.js");

describe("Controller: Mock Price Oracle", function () {
  it("Should be able to mock getUnderlyingPrice()", async function () {
    const { iToken0, mockPriceOracle } = await loadFixture(fixtureDefault);

    let price = utils.parseEther("1");
    await mockPriceOracle.mock.getUnderlyingPrice
      .withArgs(iToken0.address)
      .returns(price);

    expect(await mockPriceOracle.getUnderlyingPrice(iToken0.address)).to.equal(
      price
    );
  });
});

describe("Controller: General Information", function () {
  it("Should be able to get all iTokens", async function () {
    const { controller, iToken0, iToken1, iToken2, iToken3, iToken4, iToken5, iETH, iMUSX, iMEUX, iUSX, iEUX } = await loadFixture(
      fixtureDefault
    );

    expect(await controller.getAlliTokens()).to.have.members([
      iToken0.address,
      iToken1.address,
      iToken2.address,
      iToken3.address,
      iToken4.address,
      iToken5.address,
      iETH.address,
      iMUSX.address,
      iMEUX.address,
      iUSX.address,
      iEUX.address,
    ]);
  });
});
