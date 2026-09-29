// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title CryptoBallot Election
/// @author Eshan Pandey
/// @notice A single on-chain election: one wallet, one vote, results readable by anyone.
/// @dev Candidates are fixed at deployment so the ballot cannot be altered once voting starts.
///      An optional voter registry restricts voting to addresses the admin has registered.
contract Election {
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    /// @notice Human-readable name of this election.
    string public title;
    /// @notice Account that deployed the election and manages the voter registry.
    address public immutable admin;
    /// @notice Unix timestamp after which no more votes are accepted (0 = never closes).
    uint256 public immutable endsAt;
    /// @notice When true, only registered voters may vote.
    bool public immutable restricted;

    /// @notice Total number of votes cast.
    uint256 public totalVotes;
    /// @notice Whether an address has already voted.
    mapping(address => bool) public hasVoted;
    /// @notice Whether an address is registered to vote (only used when `restricted`).
    mapping(address => bool) public isRegistered;

    Candidate[] private _candidates;

    event Voted(address indexed voter, uint256 indexed candidateId);
    event VoterRegistered(address indexed voter);

    error NotAdmin();
    error NotRegistered();
    error AlreadyVoted();
    error InvalidCandidate(uint256 candidateId);
    error ElectionClosed();
    error NotEnoughCandidates();
    error EmptyCandidateName();
    error RegistryDisabled();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @param _title Name of the election.
    /// @param candidateNames At least two candidate names; ids are assigned from 1 in this order.
    /// @param durationSeconds How long voting stays open; 0 keeps it open indefinitely.
    /// @param _restricted Whether voting is limited to registered addresses.
    constructor(
        string memory _title,
        string[] memory candidateNames,
        uint256 durationSeconds,
        bool _restricted
    ) {
        if (candidateNames.length < 2) revert NotEnoughCandidates();

        title = _title;
        admin = msg.sender;
        restricted = _restricted;
        endsAt = durationSeconds == 0 ? 0 : block.timestamp + durationSeconds;

        for (uint256 i = 0; i < candidateNames.length; ++i) {
            if (bytes(candidateNames[i]).length == 0) revert EmptyCandidateName();
            _candidates.push(Candidate(i + 1, candidateNames[i], 0));
        }
    }

    /// @notice Cast a vote for `candidateId`. Each address can vote exactly once.
    function vote(uint256 candidateId) external {
        if (!isOpen()) revert ElectionClosed();
        if (restricted && !isRegistered[msg.sender]) revert NotRegistered();
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        if (candidateId == 0 || candidateId > _candidates.length) revert InvalidCandidate(candidateId);

        hasVoted[msg.sender] = true;
        ++_candidates[candidateId - 1].voteCount;
        ++totalVotes;

        emit Voted(msg.sender, candidateId);
    }

    /// @notice Register addresses as eligible voters. Only meaningful for restricted elections.
    function registerVoters(address[] calldata voters) external onlyAdmin {
        if (!restricted) revert RegistryDisabled();
        for (uint256 i = 0; i < voters.length; ++i) {
            if (!isRegistered[voters[i]]) {
                isRegistered[voters[i]] = true;
                emit VoterRegistered(voters[i]);
            }
        }
    }

    /// @notice Whether votes are currently being accepted.
    function isOpen() public view returns (bool) {
        return endsAt == 0 || block.timestamp < endsAt;
    }

    /// @notice Whether `account` could vote right now.
    function canVote(address account) external view returns (bool) {
        return isOpen() && !hasVoted[account] && (!restricted || isRegistered[account]);
    }

    function candidatesCount() external view returns (uint256) {
        return _candidates.length;
    }

    function getCandidate(uint256 candidateId) external view returns (Candidate memory) {
        if (candidateId == 0 || candidateId > _candidates.length) revert InvalidCandidate(candidateId);
        return _candidates[candidateId - 1];
    }

    /// @notice All candidates with their current tallies, in a single call.
    function getCandidates() external view returns (Candidate[] memory) {
        return _candidates;
    }

    /// @notice Ids of the candidate(s) with the most votes; more than one id means a tie.
    ///         Returns an empty array while no votes have been cast.
    function leaders() external view returns (uint256[] memory ids) {
        uint256 best;
        uint256 count;
        for (uint256 i = 0; i < _candidates.length; ++i) {
            uint256 votes = _candidates[i].voteCount;
            if (votes > best) {
                best = votes;
                count = 1;
            } else if (votes == best && votes > 0) {
                ++count;
            }
        }

        ids = new uint256[](count);
        if (count == 0) return ids;
        uint256 j;
        for (uint256 i = 0; i < _candidates.length; ++i) {
            if (_candidates[i].voteCount == best) {
                ids[j] = _candidates[i].id;
                ++j;
            }
        }
    }
}
