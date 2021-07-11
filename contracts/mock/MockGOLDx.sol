// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;

/**
 * @title dForce's lending MockGOLDx Contract
 * @author dForce
 */
contract MockGOLDx {
    
    uint256 public unit = 31103476800000000000;

    /**
     * @notice Construct an GOLDx
     */
    constructor() public {}

    /**
     * @dev Set a uint256 value for the unit.
     */
    function setUnit(uint256 _unit) external {
        unit = _unit;
    }
}
