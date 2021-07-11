// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title dForce's lending MockAggregator Contract
 * @author dForce
 */
contract MockAggregator {
    
    uint8 public decimals = 8;
    
    int256 public latestAnswer;

    /**
     * @notice Construct an aggregator
     */
    constructor() public {}

    /**
     * @dev Set a int256 value for the latest answer.
     */
    function setLatestAnswer(int256 _latestAnswer) external {
        latestAnswer = _latestAnswer;
    }

    /**
     * @dev Set a uint8 value for the decimals.
     */
    function setDecimals(uint8 _decimals) external {
        decimals = _decimals;
    }
}
