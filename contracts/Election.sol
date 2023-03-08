// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <=0.8.12;

contract Election {
    // Model a Candidate
    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    // Store accounts that have voted
    mapping(address => bool) public voters;
    // Store Candidates
    // Fetch Candidate
    mapping(uint256 => Candidate) public candidates;
    // Store Candidates Count
    uint256 public candidatesCount;

    // voted event
    event votedEvent(uint256 indexed _candidateId);

    constructor() public {
        addCandidate("Narendra Modi");
        addCandidate("Rahul Gandhi");
        addCandidate("Akhilesh Yadav");
        addCandidate("Mayawati");
    }

    function addCandidate(string memory _name) private {
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, _name, 0);
    }

    function vote(uint256 _candidateId) public {
        // require that they haven't voted before
        require(!voters[msg.sender]);

        // require a valid candidate
        require(_candidateId > 0 && _candidateId <= candidatesCount);

       
        voters[msg.sender] = true;  // recording that the v

       
        candidates[_candidateId].voteCount++;    // updating candidate vote count

        
        emit votedEvent(_candidateId);    // Voting Event triggered
    }
}