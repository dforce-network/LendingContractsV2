const { expect } = require("chai");
const { ethers } = require("hardhat");
const { fromRpcSig } = require("ethereumjs-util");
const ethSigUtil = require("eth-sig-util");
const Wallet = require("ethereumjs-wallet").default;

const {
  loadFixture,
  getChainId,
  fixtureDefault,
} = require("../helpers/fixtures.js");
const { EIP712Domain, domainSeparator } = require("../helpers/eip712");

const Permit = [
  { name: "owner", type: "address" },
  { name: "spender", type: "address" },
  { name: "chainId", type: "uint256" },
  { name: "value", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
];

describe("iToken permit", async function () {
  const wallet = Wallet.generate();
  const owner = wallet.getAddressString();
  const value = 500;
  const maxDeadline = 999999999999;
  let version = "1";
  let iToken, underlying, users, user1, user2, user3, spender, name, chainId;

  const buildData = (
    chainId,
    verifyingContract,
    nonce,
    deadline = maxDeadline
  ) => ({
    primaryType: "Permit",
    types: { EIP712Domain, Permit },
    domain: { name, version, chainId, verifyingContract },
    message: { owner, spender, chainId, value, nonce, deadline },
  });

  const init = async () => {
    ({
      iToken0: iToken,
      underlying0: underlying,
      accounts: users,
    } = await loadFixture(fixtureDefault));
    [user1, user2, user3] = users;
    spender = user1.address;
    name = await iToken.name();
    chainId = await getChainId();
  };

  describe("Test all scenarios for permit", function () {
    it("Domain Separator is correct", async function () {
      await init();

      expect(await iToken.DOMAIN_SEPARATOR()).to.equal(
        await domainSeparator(name, version, chainId, iToken.address)
      );
    });

    it("Should permit correctly", async function () {
      await init();

      let originalNonce = await iToken.nonces(owner);

      const data = buildData(
        chainId,
        iToken.address,
        Number(originalNonce.toString())
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await iToken.permit(owner, spender, value, maxDeadline, v, r, s);
      let currentNonce = await iToken.nonces(owner);

      expect(currentNonce.sub(originalNonce)).to.equal(1);
      expect(await iToken.allowance(owner, spender)).to.equal(value);
    });

    it("Should revert due to expired!", async function () {
      let currentNonce = await iToken.nonces(owner);
      const expiredTime = 1;
      const data = buildData(
        chainId,
        iToken.address,
        Number(currentNonce.toString()),
        expiredTime
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        iToken.permit(owner, spender, value, expiredTime, v, r, s)
      ).to.be.revertedWith("permit: EXPIRED!");
    });

    it("Should revert due to invalid signature", async function () {
      let currentNonce = await iToken.nonces(owner);
      const data = buildData(
        chainId,
        iToken.address,
        Number(currentNonce.toString())
      );
      const signature = ethSigUtil.signTypedMessage(wallet.getPrivateKey(), {
        data,
      });
      const { v, r, s } = fromRpcSig(signature);

      await expect(
        iToken.permit(owner, iToken.address, value, maxDeadline, v, r, s)
      ).to.be.revertedWith("permit: INVALID_SIGNATURE!");
    });
  });
});
