// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

import "./iToken.sol";

/**
 * @title dForce's Lending Protocol Contract.
 * @notice iTokens which wrap an EIP-20 underlying.
 * @author dForce Team.
 */
contract iTokenFF is iToken {

    /**
     * @dev Caller deposits assets into the market and `_recipient` receives iToken in exchange,
     *        and add markets to `_recipient`'s markets list for liquidity calculations.
     * @param _recipient The account that would receive the iToken.
     * @param _mintAmount The amount of the underlying token to deposit.
     */
    function mintAndEnterMarket(address _recipient, uint256 _mintAmount)
        external
        nonReentrant
        settleInterest
    {
        _mintInternal(_recipient, _mintAmount);
        controller.enterMarketFromiToken(_recipient);
    }
}
