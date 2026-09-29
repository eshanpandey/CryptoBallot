const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const TITLE = "Best Programming Language";
const NAMES = ["Rust", "TypeScript", "Go"];
const ONE_DAY = 24 * 60 * 60;

describe("Election", function () {
  async function deploy(names = NAMES, duration = 0, restricted = false) {
    const [admin, alice, bob, carol] = await ethers.getSigners();
    const election = await ethers.deployContract("Election", [TITLE, names, duration, restricted]);
    return { election, admin, alice, bob, carol };
  }

  const openElection = () => deploy();
  const timedElection = () => deploy(NAMES, ONE_DAY);
  const restrictedElection = () => deploy(NAMES, 0, true);

  describe("deployment", function () {
    it("stores the title, admin and candidates", async function () {
      const { election, admin } = await loadFixture(openElection);

      expect(await election.title()).to.equal(TITLE);
      expect(await election.admin()).to.equal(admin.address);
      expect(await election.candidatesCount()).to.equal(3);

      const candidates = await election.getCandidates();
      expect(candidates.map((c) => c.name)).to.deep.equal(NAMES);
      expect(candidates.map((c) => c.id)).to.deep.equal([1n, 2n, 3n]);
      expect(candidates.every((c) => c.voteCount === 0n)).to.equal(true);
    });

    it("stays open forever when no duration is given", async function () {
      const { election } = await loadFixture(openElection);
      expect(await election.endsAt()).to.equal(0);
      await time.increase(365 * ONE_DAY);
      expect(await election.isOpen()).to.equal(true);
    });

    it("sets a deadline when a duration is given", async function () {
      const { election } = await loadFixture(timedElection);
      const deployedAt = await time.latest();
      expect(await election.endsAt()).to.equal(deployedAt + ONE_DAY);
    });

    it("rejects fewer than two candidates", async function () {
      const factory = await ethers.getContractFactory("Election");
      await expect(ethers.deployContract("Election", [TITLE, ["Solo"], 0, false])).to.be.revertedWithCustomError(
        factory,
        "NotEnoughCandidates"
      );
    });

    it("rejects empty candidate names", async function () {
      const factory = await ethers.getContractFactory("Election");
      await expect(ethers.deployContract("Election", [TITLE, ["Rust", ""], 0, false])).to.be.revertedWithCustomError(
        factory,
        "EmptyCandidateName"
      );
    });
  });

  describe("voting", function () {
    it("records a vote and emits Voted", async function () {
      const { election, alice } = await loadFixture(openElection);

      await expect(election.connect(alice).vote(2)).to.emit(election, "Voted").withArgs(alice.address, 2);

      expect(await election.hasVoted(alice.address)).to.equal(true);
      expect((await election.getCandidate(2)).voteCount).to.equal(1);
      expect(await election.totalVotes()).to.equal(1);
    });

    it("counts votes from many voters independently", async function () {
      const { election, admin, alice, bob, carol } = await loadFixture(openElection);

      await election.connect(admin).vote(1);
      await election.connect(alice).vote(1);
      await election.connect(bob).vote(3);
      await election.connect(carol).vote(1);

      const tallies = (await election.getCandidates()).map((c) => c.voteCount);
      expect(tallies).to.deep.equal([3n, 0n, 1n]);
      expect(await election.totalVotes()).to.equal(4);
    });

    it("prevents double voting", async function () {
      const { election, alice } = await loadFixture(openElection);

      await election.connect(alice).vote(1);
      await expect(election.connect(alice).vote(2)).to.be.revertedWithCustomError(election, "AlreadyVoted");
      expect((await election.getCandidate(2)).voteCount).to.equal(0);
    });

    for (const badId of [0, 4, 99]) {
      it(`rejects invalid candidate id ${badId}`, async function () {
        const { election, alice } = await loadFixture(openElection);

        await expect(election.connect(alice).vote(badId))
          .to.be.revertedWithCustomError(election, "InvalidCandidate")
          .withArgs(badId);
        expect(await election.hasVoted(alice.address)).to.equal(false);
      });
    }

    it("reverts getCandidate for an unknown id", async function () {
      const { election } = await loadFixture(openElection);
      await expect(election.getCandidate(0)).to.be.revertedWithCustomError(election, "InvalidCandidate");
      await expect(election.getCandidate(4)).to.be.revertedWithCustomError(election, "InvalidCandidate");
    });
  });

  describe("deadline", function () {
    it("accepts votes before the deadline", async function () {
      const { election, alice } = await loadFixture(timedElection);
      await time.increase(ONE_DAY - 10);
      await expect(election.connect(alice).vote(1)).to.emit(election, "Voted");
    });

    it("rejects votes once the deadline passes", async function () {
      const { election, alice } = await loadFixture(timedElection);
      await time.increaseTo(await election.endsAt());

      expect(await election.isOpen()).to.equal(false);
      expect(await election.canVote(alice.address)).to.equal(false);
      await expect(election.connect(alice).vote(1)).to.be.revertedWithCustomError(election, "ElectionClosed");
    });
  });

  describe("voter registry", function () {
    it("blocks unregistered voters in a restricted election", async function () {
      const { election, alice } = await loadFixture(restrictedElection);
      expect(await election.canVote(alice.address)).to.equal(false);
      await expect(election.connect(alice).vote(1)).to.be.revertedWithCustomError(election, "NotRegistered");
    });

    it("lets the admin register voters, once each", async function () {
      const { election, alice, bob } = await loadFixture(restrictedElection);

      await expect(election.registerVoters([alice.address, bob.address, alice.address]))
        .to.emit(election, "VoterRegistered")
        .withArgs(alice.address)
        .and.to.emit(election, "VoterRegistered")
        .withArgs(bob.address);

      expect(await election.canVote(alice.address)).to.equal(true);
      await expect(election.connect(alice).vote(3)).to.emit(election, "Voted").withArgs(alice.address, 3);
    });

    it("only allows the admin to register voters", async function () {
      const { election, alice } = await loadFixture(restrictedElection);
      await expect(election.connect(alice).registerVoters([alice.address])).to.be.revertedWithCustomError(
        election,
        "NotAdmin"
      );
    });

    it("refuses registration when the election is open to everyone", async function () {
      const { election, alice } = await loadFixture(openElection);
      await expect(election.registerVoters([alice.address])).to.be.revertedWithCustomError(
        election,
        "RegistryDisabled"
      );
    });
  });

  describe("leaders", function () {
    it("is empty before any votes", async function () {
      const { election } = await loadFixture(openElection);
      expect(await election.leaders()).to.deep.equal([]);
    });

    it("returns the single leader", async function () {
      const { election, alice, bob, carol } = await loadFixture(openElection);
      await election.connect(alice).vote(2);
      await election.connect(bob).vote(2);
      await election.connect(carol).vote(3);
      expect(await election.leaders()).to.deep.equal([2n]);
    });

    it("returns every candidate in a tie", async function () {
      const { election, alice, bob } = await loadFixture(openElection);
      await election.connect(alice).vote(1);
      await election.connect(bob).vote(3);
      expect(await election.leaders()).to.deep.equal([1n, 3n]);
    });
  });
});
