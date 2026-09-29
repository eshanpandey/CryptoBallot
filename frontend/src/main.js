import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import { deployment, network, PREVIEW } from "./config.js";
import "./style.css";

const REFRESH_MS = 12_000;
// Public RPCs cap eth_getLogs ranges, so only scan recent history for the activity feed.
const LOG_WINDOW = 45_000;

const $ = (id) => document.getElementById(id);

const state = {
  readContract: null,
  writeContract: null,
  account: null,
  walletChainId: null,
  election: null,
  pendingCandidate: null,
};

// ---------- helpers ----------

const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function explorerLink(kind, value, label = shortAddr(value)) {
  if (!network?.explorer) return el("span", { className: "mono" }, label);
  return el("a", { className: "mono", href: `${network.explorer}/${kind}/${value}`, target: "_blank", rel: "noopener" }, label);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null) node.append(child);
  return node;
}

function formatRemaining(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(m, 1)}m left`;
}

let toastTimer;
function toast(message, { kind = "info", link, sticky = false } = {}) {
  const box = $("toast");
  box.className = `toast toast-${kind}`;
  box.replaceChildren(el("span", {}, message));
  if (link) box.append(" ", link);
  box.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => (box.hidden = true), 6000);
}

function banner(message) {
  const b = $("banner");
  b.textContent = message;
  b.hidden = !message;
}

const FRIENDLY_ERRORS = {
  AlreadyVoted: "This wallet has already voted.",
  ElectionClosed: "Voting has closed for this election.",
  NotRegistered: "This wallet is not registered to vote in this election.",
  InvalidCandidate: "That candidate does not exist.",
};

function describeError(err) {
  if (err?.code === "ACTION_REJECTED" || err?.info?.error?.code === 4001) return "Transaction rejected in wallet.";
  const name = err?.revert?.name;
  if (name && FRIENDLY_ERRORS[name]) return FRIENDLY_ERRORS[name];
  return err?.shortMessage || err?.message || "Something went wrong.";
}

// ---------- data ----------

async function loadElection() {
  const c = state.readContract;
  const [title, candidates, totalVotes, endsAt, restricted, leaders] = await Promise.all([
    c.title(),
    c.getCandidates(),
    c.totalVotes(),
    c.endsAt(),
    c.restricted(),
    c.leaders(),
  ]);
  const voter = state.account
    ? await Promise.all([c.hasVoted(state.account), c.canVote(state.account)])
    : [false, false];
  return {
    title,
    candidates: candidates.map((x) => ({ id: x.id, name: x.name, voteCount: x.voteCount })),
    totalVotes,
    endsAt: Number(endsAt),
    restricted,
    leaders: leaders.map(Number),
    hasVoted: voter[0],
    canVote: voter[1],
  };
}

async function loadActivity(candidates) {
  const provider = state.readContract.runner;
  const latest = await provider.getBlockNumber();
  const from = Math.max(deployment.deployBlock ?? 0, latest - LOG_WINDOW);
  const events = await state.readContract.queryFilter(state.readContract.filters.Voted(), from, latest);
  const names = new Map(candidates.map((c) => [Number(c.id), c.name]));
  return events
    .slice(-8)
    .reverse()
    .map((e) => ({ voter: e.args.voter, candidate: names.get(Number(e.args.candidateId)), tx: e.transactionHash }));
}

// ---------- rendering ----------

function renderElection(e, { preview = false } = {}) {
  $("election-title").textContent = e.title;
  document.title = `${e.title} · CryptoBallot`;

  const now = Date.now() / 1000;
  const open = e.endsAt === 0 || now < e.endsAt;
  const status = $("stat-status");
  status.textContent = preview ? "Preview" : !open ? "Closed" : e.endsAt ? `Open · ${formatRemaining(e.endsAt - now)}` : "Open";
  status.dataset.tone = preview ? "" : open ? "good" : "bad";

  const total = e.candidates.reduce((sum, c) => sum + c.voteCount, 0n);
  $("stat-total").textContent = total.toLocaleString();
  $("stat-eligibility").textContent = e.restricted ? "Registered voters" : "Any wallet";
  $("stat-contract").replaceChildren(preview ? "Not deployed" : explorerLink("address", deployment.address));

  const voterStatus = $("voter-status");
  if (preview) voterStatus.textContent = "";
  else if (!state.account) voterStatus.textContent = "Connect a wallet to cast your vote. Results are live for everyone.";
  else if (e.hasVoted) voterStatus.textContent = "Your vote is recorded on-chain. Thanks for voting!";
  else if (!open) voterStatus.textContent = "Voting has closed.";
  else if (e.restricted && !e.canVote) voterStatus.textContent = "This wallet is not on the voter registry.";
  else if (!onRightChain()) voterStatus.textContent = `Switch your wallet to ${network.name} to vote.`;
  else voterStatus.textContent = "Pick a candidate below. You can vote once.";

  const leaders = new Set(e.leaders ?? []);
  const canVoteNow = !preview && state.account && e.canVote && onRightChain();
  const list = $("candidates");
  list.replaceChildren(
    ...e.candidates.map((c) => {
      const pct = total > 0n ? Number((c.voteCount * 1000n) / total) / 10 : 0;
      const isPending = state.pendingCandidate === Number(c.id);
      const button = el(
        "button",
        {
          className: "btn btn-vote",
          type: "button",
          disabled: !canVoteNow || state.pendingCandidate != null,
          onclick: () => castVote(Number(c.id), c.name),
        },
        isPending ? "Confirming…" : "Vote"
      );
      const bar = el("div", { className: "bar" }, el("div", { className: "bar-fill" }));
      bar.firstChild.style.width = `${pct}%`;
      return el(
        "article",
        { className: `candidate${leaders.has(Number(c.id)) ? " is-leader" : ""}` },
        el(
          "div",
          { className: "candidate-head" },
          el("h3", {}, c.name),
          leaders.has(Number(c.id)) ? el("span", { className: "badge" }, leaders.size > 1 ? "Tied lead" : "Leading") : null
        ),
        bar,
        el(
          "div",
          { className: "candidate-foot" },
          el("span", { className: "votes" }, `${c.voteCount.toLocaleString()} vote${c.voteCount === 1n ? "" : "s"} · ${pct}%`),
          button
        )
      );
    })
  );
}

function renderActivity(items) {
  const list = $("activity");
  if (!items.length) return list.replaceChildren(el("li", { className: "muted" }, "No votes yet."));
  list.replaceChildren(
    ...items.map((v) =>
      el("li", {}, explorerLink("address", v.voter), " voted for ", el("strong", {}, v.candidate ?? "?"), " ", explorerLink("tx", v.tx, "tx ↗"))
    )
  );
}

function renderWallet() {
  const btn = $("connect-btn");
  const pill = $("network-pill");
  if (network) {
    pill.hidden = false;
    pill.textContent = network.name;
    pill.dataset.tone = state.account && !onRightChain() ? "bad" : "";
  }
  if (!state.account) {
    btn.textContent = "Connect wallet";
    btn.disabled = !deployment;
  } else if (!onRightChain()) {
    btn.textContent = `Switch to ${network.name}`;
    btn.disabled = false;
  } else {
    btn.textContent = shortAddr(state.account);
    btn.disabled = true;
  }
}

// ---------- actions ----------

const onRightChain = () => state.walletChainId === deployment?.chainId;

async function refresh() {
  try {
    state.election = await loadElection();
    renderElection(state.election);
    renderWallet();
  } catch (err) {
    console.error(err);
    banner(`Could not read the election from ${network.name}. Retrying…`);
    return;
  }
  banner("");
  try {
    renderActivity(await loadActivity(state.election.candidates));
  } catch (err) {
    console.warn("Activity feed unavailable", err);
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    toast("No wallet found. Install MetaMask to vote.", {
      kind: "error",
      link: el("a", { href: "https://metamask.io/download/", target: "_blank", rel: "noopener" }, "Get MetaMask ↗"),
    });
    return;
  }
  try {
    const [account] = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.account = account;
    if (!onRightChain()) await switchChain();
    await syncWallet();
  } catch (err) {
    toast(describeError(err), { kind: "error" });
  }
}

async function switchChain() {
  const chainId = `0x${deployment.chainId.toString(16)}`;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    if (err.code !== 4902) throw err;
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: network.name,
          rpcUrls: [network.rpcUrl],
          nativeCurrency: network.currency,
          blockExplorerUrls: network.explorer ? [network.explorer] : [],
        },
      ],
    });
  }
}

async function syncWallet() {
  const provider = new BrowserProvider(window.ethereum);
  state.walletChainId = Number((await provider.getNetwork()).chainId);
  const accounts = await provider.send("eth_accounts", []);
  state.account = accounts[0] ?? null;
  state.writeContract = state.account && onRightChain()
    ? new Contract(deployment.address, deployment.abi, await provider.getSigner())
    : null;
  renderWallet();
  await refresh();
}

async function castVote(candidateId, name) {
  if (!state.writeContract) return connectWallet();
  state.pendingCandidate = candidateId;
  renderElection(state.election);
  try {
    toast(`Confirm your vote for ${name} in your wallet…`, { sticky: true });
    const tx = await state.writeContract.vote(candidateId);
    toast("Vote submitted. Waiting for confirmation…", { sticky: true, link: explorerLink("tx", tx.hash, "View tx ↗") });
    await tx.wait();
    toast(`Vote for ${name} confirmed on-chain.`, { kind: "success", link: explorerLink("tx", tx.hash, "View tx ↗") });
  } catch (err) {
    console.error(err);
    toast(describeError(err), { kind: "error" });
  } finally {
    state.pendingCandidate = null;
    await refresh();
  }
}

// ---------- boot ----------

async function main() {
  $("connect-btn").addEventListener("click", () => (state.account && !onRightChain() ? switchChain().then(syncWallet).catch((e) => toast(describeError(e), { kind: "error" })) : connectWallet()));

  if (!deployment) {
    banner("Preview mode: the contract has not been deployed yet, so these numbers are sample data.");
    renderElection({ ...PREVIEW, endsAt: 0, restricted: false, leaders: [1] }, { preview: true });
    renderWallet();
    return;
  }

  state.readContract = new Contract(deployment.address, deployment.abi, new JsonRpcProvider(network.rpcUrl, deployment.chainId, { staticNetwork: true }));

  if (window.ethereum) {
    window.ethereum.on?.("accountsChanged", syncWallet);
    window.ethereum.on?.("chainChanged", syncWallet);
    await syncWallet().catch(() => refresh());
  } else {
    await refresh();
  }
  setInterval(refresh, REFRESH_MS);
}

main();
