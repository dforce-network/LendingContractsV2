// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

/**
 * @title dForce's AggregatorModel Contract
 * @author dForce
 * @notice The aggregator model is a reorganization of the third-party price oracle,
 *          so it can be applied to the priceOracle contract price system
 */
abstract contract AggregatorModel {
    /**
     * @notice Reads the current answer from aggregator delegated to.
     */
    function latestAnswer() external view virtual returns (int256);

    /**
    * @notice represents the number of decimals the aggregator responses represent.
    */
    function decimals() external view virtual returns (uint8);
}