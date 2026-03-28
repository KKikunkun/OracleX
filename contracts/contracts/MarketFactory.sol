// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PredictionMarket.sol";

/**
 * @title MarketFactory
 * @notice OracleX — Factory for deploying prediction market instances
 * @dev Only Creator Agent can deploy new markets.
 *      All deployed markets are tracked for frontend enumeration.
 */
contract MarketFactory {

    // ─── State ───────────────────────────────────────────────

    address[] public markets;
    address   public creatorAgent;
    address   public resolverAgent;
    address   public platformWallet;
    address   public owner;

    mapping(address => bool) public isMarket;

    // ─── Events ──────────────────────────────────────────────

    event MarketDeployed(
        address indexed market,
        string  question,
        string  instId,
        uint256 targetPrice,
        uint256 deadline,
        address creatorAgent
    );

    event AgentUpdated(string role, address oldAddr, address newAddr);

    // ─── Modifiers ────────────────────────────────────────────

    modifier onlyCreator() {
        require(msg.sender == creatorAgent, "Not creator agent");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────

    constructor(
        address _creatorAgent,
        address _resolverAgent,
        address _platformWallet
    ) {
        require(_creatorAgent  != address(0), "Invalid creator");
        require(_resolverAgent != address(0), "Invalid resolver");
        creatorAgent   = _creatorAgent;
        resolverAgent  = _resolverAgent;
        platformWallet = _platformWallet;
        owner          = msg.sender;
    }

    // ─── Deploy ───────────────────────────────────────────────

    /**
     * @notice Creator Agent deploys a new prediction market
     * @param _question       Prediction question text
     * @param _instId         OKX trading pair (e.g. "BTC-USDT")
     * @param _targetPrice    Target price in 1e8 precision
     * @param _deadline       Settlement timestamp (unix seconds)
     * @param _jobCommitHash  ERC-8183 job commit proof
     * @dev msg.value is split 50/50 as initial YES/NO liquidity
     */
    function deployMarket(
        string  memory _question,
        string  memory _instId,
        uint256 _targetPrice,
        uint256 _deadline,
        bytes32 _jobCommitHash
    ) external payable onlyCreator returns (address) {
        require(bytes(_question).length > 0, "Empty question");
        require(_deadline > block.timestamp, "Deadline must be future");

        PredictionMarket market = new PredictionMarket{value: msg.value}(
            _question,
            _instId,
            _targetPrice,
            _deadline,
            resolverAgent,
            platformWallet,
            _jobCommitHash
        );

        address addr = address(market);
        markets.push(addr);
        isMarket[addr] = true;

        emit MarketDeployed(addr, _question, _instId, _targetPrice, _deadline, msg.sender);
        return addr;
    }

    // ─── View ─────────────────────────────────────────────────

    function getMarkets() external view returns (address[] memory) {
        return markets;
    }

    function totalMarkets() external view returns (uint256) {
        return markets.length;
    }

    function getActiveMarkets() external view returns (address[] memory) {
        uint256 count;
        for (uint256 i = 0; i < markets.length; i++) {
            PredictionMarket m = PredictionMarket(payable(markets[i]));
            if (!m.resolved() && block.timestamp < m.deadline()) count++;
        }
        address[] memory active = new address[](count);
        uint256 idx;
        for (uint256 i = 0; i < markets.length; i++) {
            PredictionMarket m = PredictionMarket(payable(markets[i]));
            if (!m.resolved() && block.timestamp < m.deadline()) {
                active[idx++] = markets[i];
            }
        }
        return active;
    }

    function getResolvedMarkets() external view returns (address[] memory) {
        uint256 count;
        for (uint256 i = 0; i < markets.length; i++) {
            if (PredictionMarket(payable(markets[i])).resolved()) count++;
        }
        address[] memory resolved = new address[](count);
        uint256 idx;
        for (uint256 i = 0; i < markets.length; i++) {
            if (PredictionMarket(payable(markets[i])).resolved()) {
                resolved[idx++] = markets[i];
            }
        }
        return resolved;
    }

    // ─── Admin ────────────────────────────────────────────────

    function setCreatorAgent(address _new) external onlyOwner {
        emit AgentUpdated("creator", creatorAgent, _new);
        creatorAgent = _new;
    }

    function setResolverAgent(address _new) external onlyOwner {
        emit AgentUpdated("resolver", resolverAgent, _new);
        resolverAgent = _new;
    }
}
