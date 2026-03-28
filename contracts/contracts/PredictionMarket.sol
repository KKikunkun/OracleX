// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PredictionMarket
 * @notice OracleX — Virtual liquidity prediction market (Polymarket-style)
 * @dev Uses virtual reserves for the CPMM so no initial capital is needed.
 *      Virtual liquidity controls price sensitivity without locking real funds.
 *      Price = noPool / (yesPool + noPool), ranges 0-100%.
 *      Deployed by MarketFactory. Resolved by Resolver Agent using OKX price.
 *      X Layer Mainnet (chainId 196) — Zero Gas
 */
contract PredictionMarket {

    // ─── Reentrancy Guard ────────────────────────────────────
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "Reentrancy");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ─── Constants ───────────────────────────────────────────
    // Virtual liquidity: 1 OKB per side = 2 OKB total virtual reserves
    // This means a 0.01 OKB bet moves price ~0.5% (reasonable)
    // No real OKB is locked — only user deposits are real
    uint256 public constant VIRTUAL_LIQUIDITY = 1 ether;  // 1 OKB
    uint256 public constant PLATFORM_FEE_BPS = 200;       // 2%

    // ─── State ───────────────────────────────────────────────

    string  public question;
    string  public instId;
    uint256 public targetPrice;     // 1e8 precision
    uint256 public deadline;
    uint256 public resolutionPrice;
    bool    public resolved;
    bool    public outcomeYes;

    // CPMM pools (include virtual liquidity)
    uint256 public yesPool;
    uint256 public noPool;

    address public creatorAgent;
    address public resolverAgent;
    address public platformWallet;

    // User shares
    mapping(address => uint256) public yesShares;
    mapping(address => uint256) public noShares;
    mapping(address => bool)    public claimed;

    uint256 public totalYesMinted;
    uint256 public totalNoMinted;

    // Job hash audit trail
    bytes32 public jobCommitHash;
    bytes32 public jobCompleteHash;

    // ─── Events ──────────────────────────────────────────────

    event MarketCreated(address indexed market, string question, string instId, uint256 targetPrice, uint256 deadline);
    event SharesBought(address indexed user, bool isYes, uint256 amountIn, uint256 sharesOut, uint256 priceAfter, uint256 newYesPool, uint256 newNoPool);
    event MarketResolved(uint256 settlementPrice, bool outcomeYes, bytes32 jobCompleteHash);
    event WinningsClaimed(address indexed user, uint256 amount);

    // ─── Modifiers ────────────────────────────────────────────

    modifier onlyResolver() { require(msg.sender == resolverAgent, "Not resolver"); _; }
    modifier notResolved()  { require(!resolved, "Already resolved"); _; }
    modifier afterDeadline()  { require(block.timestamp >= deadline, "Too early"); _; }
    modifier beforeDeadline() { require(block.timestamp < deadline, "Betting closed"); _; }

    // ─── Constructor ─────────────────────────────────────────
    // No msg.value needed! Virtual liquidity provides the initial pricing.

    constructor(
        string  memory _question,
        string  memory _instId,
        uint256 _targetPrice,
        uint256 _deadline,
        address _resolverAgent,
        address _platformWallet,
        bytes32 _jobCommitHash
    ) payable {
        require(_deadline > block.timestamp, "Deadline must be future");
        require(_targetPrice > 0,            "Invalid target price");
        require(_resolverAgent != address(0), "Invalid resolver");

        question       = _question;
        instId         = _instId;
        targetPrice    = _targetPrice;
        deadline       = _deadline;
        creatorAgent   = msg.sender;
        resolverAgent  = _resolverAgent;
        platformWallet = _platformWallet;
        jobCommitHash  = _jobCommitHash;

        // Virtual liquidity — no real OKB locked
        yesPool = VIRTUAL_LIQUIDITY;
        noPool  = VIRTUAL_LIQUIDITY;

        emit MarketCreated(address(this), _question, _instId, _targetPrice, _deadline);
    }

    // ─── CPMM Buy (with virtual reserves) ─────────────────────
    //
    // k = yesPool * noPool (includes virtual liquidity)
    // Virtual reserves ensure reasonable price sensitivity:
    //   - 0.01 OKB bet on a 1+1 pool → price moves ~0.5%
    //   - 0.1 OKB bet → price moves ~5%
    //   - 1 OKB bet → price moves ~25%
    //
    // Users receive shares proportional to their impact on the pool.
    // Only real OKB (address(this).balance) is paid out on resolution.

    function buyYes() external payable notResolved beforeDeadline nonReentrant {
        require(msg.value > 0, "Must send OKB");

        uint256 amountIn = msg.value;
        uint256 k = yesPool * noPool;

        uint256 newYesPool = yesPool + amountIn;
        uint256 newNoPool  = k / newYesPool;
        uint256 sharesOut  = noPool - newNoPool;

        require(sharesOut > 0, "Insufficient output");

        yesPool = newYesPool;
        noPool  = newNoPool;
        yesShares[msg.sender] += sharesOut;
        totalYesMinted += sharesOut;

        uint256 total = yesPool + noPool;
        uint256 yesPriceAfter = (noPool * 10000) / total;

        emit SharesBought(msg.sender, true, amountIn, sharesOut, yesPriceAfter, yesPool, noPool);
    }

    function buyNo() external payable notResolved beforeDeadline nonReentrant {
        require(msg.value > 0, "Must send OKB");

        uint256 amountIn = msg.value;
        uint256 k = yesPool * noPool;

        uint256 newNoPool  = noPool + amountIn;
        uint256 newYesPool = k / newNoPool;
        uint256 sharesOut  = yesPool - newYesPool;

        require(sharesOut > 0, "Insufficient output");

        noPool  = newNoPool;
        yesPool = newYesPool;
        noShares[msg.sender] += sharesOut;
        totalNoMinted += sharesOut;

        uint256 total = yesPool + noPool;
        uint256 noPriceAfter = (yesPool * 10000) / total;

        emit SharesBought(msg.sender, false, amountIn, sharesOut, noPriceAfter, yesPool, noPool);
    }

    // ─── Price View ───────────────────────────────────────────

    function getOdds() external view returns (uint256 yesOdds, uint256 noOdds) {
        uint256 total = yesPool + noPool;
        if (total == 0) return (5000, 5000);
        yesOdds = (noPool  * 10000) / total;
        noOdds  = (yesPool * 10000) / total;
    }

    // ─── Resolution ───────────────────────────────────────────

    function resolve(
        uint256 _settlementPrice,
        bytes32 _jobCompleteHash
    ) external onlyResolver notResolved afterDeadline nonReentrant {
        resolutionPrice = _settlementPrice;
        outcomeYes      = _settlementPrice >= targetPrice;
        resolved        = true;
        jobCompleteHash = _jobCompleteHash;

        // Collect platform fee only if both sides have participants
        // If one side is empty, refund() will handle distribution without fee
        uint256 totalBalance = address(this).balance;
        bool bothSidesActive = totalYesMinted > 0 && totalNoMinted > 0;
        if (totalBalance > 0 && bothSidesActive) {
            uint256 fee = (totalBalance * PLATFORM_FEE_BPS) / 10000;
            if (fee > 0 && platformWallet != address(0)) {
                (bool ok, ) = platformWallet.call{value: fee}("");
                require(ok, "Fee transfer failed");
            }
        }

        emit MarketResolved(_settlementPrice, outcomeYes, _jobCompleteHash);
    }

    // ─── Claim ────────────────────────────────────────────────
    // Winners split real OKB balance (only actual deposits, not virtual)

    function claimWinnings() external nonReentrant {
        require(resolved,             "Not resolved yet");
        require(!claimed[msg.sender], "Already claimed");

        uint256 userShares;
        uint256 totalShares;

        if (outcomeYes) {
            userShares  = yesShares[msg.sender];
            totalShares = totalYesMinted;
        } else {
            userShares  = noShares[msg.sender];
            totalShares = totalNoMinted;
        }

        require(userShares > 0,  "No winning shares");
        require(totalShares > 0, "No winners");

        claimed[msg.sender] = true;
        uint256 payout = (userShares * address(this).balance) / totalShares;

        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "Payout failed");

        emit WinningsClaimed(msg.sender, payout);
    }

    // ─── Refund (no counterparty) ───────────────────────────────
    // If the winning side has zero shares, losing side can reclaim deposits

    function refund() external nonReentrant {
        require(resolved, "Not resolved yet");
        require(!claimed[msg.sender], "Already claimed");

        // Only allow refund if winning side has no participants
        uint256 winningShares = outcomeYes ? totalYesMinted : totalNoMinted;
        require(winningShares == 0, "Winners exist, use claimWinnings");

        // Refund the losing side's deposit proportionally
        uint256 userShares;
        uint256 totalShares;
        if (outcomeYes) {
            // YES won but no YES bettors → refund NO bettors
            userShares  = noShares[msg.sender];
            totalShares = totalNoMinted;
        } else {
            // NO won but no NO bettors → refund YES bettors
            userShares  = yesShares[msg.sender];
            totalShares = totalYesMinted;
        }

        require(userShares > 0,  "No shares to refund");
        require(totalShares > 0, "Nothing to refund");

        claimed[msg.sender] = true;
        uint256 payout = (userShares * address(this).balance) / totalShares;

        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "Refund failed");

        emit WinningsClaimed(msg.sender, payout);
    }

    // ─── View ─────────────────────────────────────────────────

    function getStatus() external view returns (
        bool    _resolved,
        bool    _outcomeYes,
        uint256 _yesPool,
        uint256 _noPool,
        uint256 _deadline,
        uint256 _resolutionPrice,
        uint256 _targetPrice
    ) {
        return (resolved, outcomeYes, yesPool, noPool, deadline, resolutionPrice, targetPrice);
    }

    function getUserShares(address user) external view returns (
        uint256 yes,
        uint256 no,
        bool    hasClaimed
    ) {
        return (yesShares[user], noShares[user], claimed[user]);
    }

    receive() external payable {}
}
