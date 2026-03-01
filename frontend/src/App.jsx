import { useState } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  isConnected,
  setAllowed,
  getAddress,
  signAuthEntry,
} from "@stellar/freighter-api";
import { SorobanPaymaster } from "./SorobanPaymaster";
import "./App.css";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

const paymaster = new SorobanPaymaster({
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: NETWORK_PASSPHRASE,
  contractId: "CAPDJ4F747URENH5FLAKHXH377JOENTSRCY4NQBJQZZIEJEBGUZG5NCY",
  feeToken: "CA63EPM4EEXUVUANF6FQUJEJ37RWRYIXCARWFXYUMPP7RLZWFNLTVNR4",
  relayerUrl: "https://stellar-gas-station-api.onrender.com/relay",
  relayerPublicKey: "GCF57AY6GBLPG6VK3LU27A4E5CSJRYSNSBA5XB2V6MKPUVF7PSHTT5KW",
  feeAmount: 5_000_000n,
});

const SEND_AMOUNT = 100_000_000n;

function freighterSigner(networkPassphrase) {
  return async (preimage) => {
    const { signedAuthEntry, error: authError, signerAddress } =
      await signAuthEntry(preimage.toXDR("base64"), { networkPassphrase });

    if (authError || !signedAuthEntry) {
      throw new Error("Authorization signing rejected.");
    }

    const sigBytes = Uint8Array.from(atob(signedAuthEntry), (c) =>
      c.charCodeAt(0),
    );
    return { signature: sigBytes, publicKey: signerAddress };
  };
}

function truncAddr(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : "";
}

function fmtUsdc(raw) {
  return (Number(raw) / 1e7).toFixed(2);
}

/* ────────────────────────────────────────────── */

function App() {
  const [publicKey, setPublicKey] = useState(null);
  const [balance, setBalance] = useState(null);
  const [tokenOk, setTokenOk] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  async function connectWallet() {
    try {
      const { isConnected: connected } = await isConnected();
      if (!connected) {
        setStatus({ type: "error", msg: "Freighter extension not detected. Please install it from freighter.app" });
        return;
      }

      const allowed = await setAllowed();
      if (allowed.error) {
        setStatus({ type: "error", msg: "Connection rejected by wallet." });
        return;
      }

      const { address, error } = await getAddress();
      if (error) {
        setStatus({ type: "error", msg: "Could not retrieve wallet address." });
        return;
      }

      setPublicKey(address);
      setStatus({ type: "info", msg: "Checking USDC balance…" });

      const bal = await paymaster.getTokenBalance(address);
      if (bal === null) {
        setTokenOk(false);
        setBalance(null);
        setStatus({ type: "error", msg: "USDC trustline not found. Add one via Step 2." });
      } else {
        setTokenOk(true);
        setBalance(bal);
        setStatus({ type: "success", msg: `Wallet connected — ${fmtUsdc(bal)} USDC available` });
      }
    } catch (err) {
      setStatus({ type: "error", msg: err.message });
    }
  }

  async function handleSend() {
    if (!publicKey || !recipient) {
      setStatus({ type: "error", msg: "Enter a valid recipient address." });
      return;
    }

    setLoading(true);
    try {
      const result = await paymaster.execute({
        user: publicKey,
        targetContract: paymaster.feeToken,
        functionName: "transfer",
        args: [
          new StellarSdk.Address(publicKey).toScVal(),
          new StellarSdk.Address(recipient).toScVal(),
          StellarSdk.nativeToScVal(SEND_AMOUNT, { type: "i128" }),
        ],
        signer: freighterSigner(NETWORK_PASSPHRASE),
        onStatus: setStatus,
      });

      setStatus({
        type: "success",
        msg: `Transaction ${result.status}! Hash: ${result.hash}`,
      });

      const newBal = await paymaster.getTokenBalance(publicKey);
      if (newBal !== null) setBalance(newBal);
    } catch (err) {
      const respData = err.response?.data;
      let msg = respData?.error || err.message || "Unknown error occurred.";

      if (respData?.diagnosticEvents?.length) {
        const evtSummary = respData.diagnosticEvents
          .map((e) => (typeof e === "string" ? e : JSON.stringify(e.data)))
          .join(" | ");
        msg += ` [events: ${evtSummary}]`;
      }

      if (respData?.hash) {
        msg += ` (tx: ${respData.hash})`;
      }

      console.error("Relay error:", respData ?? err);
      setStatus({ type: "error", msg });
    } finally {
      setLoading(false);
    }
  }

  function handleOnboardingAction(action) {
    if (action === "usdc") {
      setStatus({
        type: "warning",
        msg: "V2 Vision: Claimable Balances will auto-airdrop test USDC to new wallets. For now, use the Stellar Laboratory to send testnet USDC.",
      });
    } else {
      setStatus({
        type: "warning",
        msg: "V2 Vision: Trustlines will be auto-established via sponsored transactions. Currently, add the USDC trustline manually from your wallet.",
      });
    }
  }

  const needsMore =
    balance !== null && balance < SEND_AMOUNT + paymaster.feeAmount;

  return (
    <div className="app">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <a href="#" className="nav-brand">
          <span className="nav-logo">⛽</span> Soroban Gas Station
        </a>
        <ul className="nav-links">
          <li><a href="#docs">How It Works</a></li>
          <li><a href="#architecture">Architecture</a></li>
          <li><a href="#playground">Demo</a></li>
        </ul>
        {publicKey ? (
          <div className="nav-wallet-btn">
            <span className="nav-dot" />
            {truncAddr(publicKey)}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={connectWallet} style={{ padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}>
            Connect Wallet
          </button>
        )}
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="pulse" />
          Live on Stellar Testnet
        </div>
        <h1>Soroban Gas Station</h1>
        <p className="hero-subtitle">
          Eliminating gas friction for the Stellar ecosystem.
          Let your users pay fees in USDC — zero XLM required.
        </p>
        <div className="hero-actions">
          <a href="#playground" className="btn btn-primary">
            Try the Demo
          </a>
          <a
            href="https://github.com/yigitturaan/stellar-paymaster-v2"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* ── Documentation ── */}
      <section id="docs" className="section">
        <span className="section-label">Why It Matters</span>
        <h2 className="section-title">The Problem & Our Solution</h2>
        <p className="section-desc">
          Every Soroban transaction requires XLM for gas — a huge barrier for new
          users who only hold stablecoins. We built an SDK that removes this
          friction entirely.
        </p>
        <div className="docs-grid">
          <div className="glass-card">
            <div className="card-icon">🚧</div>
            <h3>The Problem</h3>
            <p>
              Users must acquire XLM before they can do <em>anything</em> on
              Stellar. This creates a <span className="card-highlight">multi-step
              onboarding wall</span> that kills conversion for consumer dApps,
              wallets, and payment flows.
            </p>
          </div>
          <div className="glass-card">
            <div className="card-icon">⚡</div>
            <h3>Our Solution</h3>
            <p>
              An <span className="card-highlight-green">action-agnostic Paymaster
              SDK</span> that wraps any Soroban contract call. A relayer bot pays
              the XLM fee and atomically collects a small token fee (e.g. 0.5 USDC)
              from the user — all in a single transaction.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="section">
        <span className="section-label">SDK Capabilities</span>
        <h2 className="section-title">Built for Developers</h2>
        <div className="features-grid">
          <div className="glass-card feature-card">
            <div className="card-icon">🔌</div>
            <h3>Action-Agnostic</h3>
            <p>Works with any Soroban contract — transfers, swaps, NFT mints, governance votes.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="card-icon">🛡️</div>
            <h3>Atomic Execution</h3>
            <p>Fee payment and the user action happen in a single transaction. No partial failures.</p>
          </div>
          <div className="glass-card feature-card">
            <div className="card-icon">🧩</div>
            <h3>3-Line Integration</h3>
            <p>Import the SDK, configure once, call <code>paymaster.execute()</code>. That&apos;s it.</p>
          </div>
        </div>

        <div className="code-block">
          <pre>{`<span class="cmt">// Gasless USDC transfer in 3 lines</span>
<span class="kw">const</span> paymaster = <span class="kw">new</span> <span class="fn">SorobanPaymaster</span>({ ...config });

<span class="kw">await</span> paymaster.<span class="fn">execute</span>({
  user:           publicKey,
  targetContract: <span class="str">"CUSDC..."</span>,
  functionName:   <span class="str">"transfer"</span>,
  args:           [from, to, amount],
  signer:         myWalletSigner,
});`}
          </pre>
        </div>
      </section>

      {/* ── Architecture ── */}
      <section id="architecture" className="section arch-section">
        <span className="section-label">System Design</span>
        <h2 className="section-title">Architecture</h2>
        <p className="section-desc" style={{ margin: "0 auto" }}>
          Four components working together to deliver a seamless gasless experience.
        </p>
        <div className="arch-flow">
          <div className="arch-node">
            <span className="arch-node-icon">🌐</span>
            <span className="arch-node-label">Your DApp</span>
            <span className="arch-node-sub">React / Any</span>
          </div>
          <div className="arch-arrow">
            <span>SDK call</span>
            <div className="arch-arrow-line" />
          </div>
          <div className="arch-node">
            <span className="arch-node-icon">📦</span>
            <span className="arch-node-label">Paymaster SDK</span>
            <span className="arch-node-sub">SorobanPaymaster.js</span>
          </div>
          <div className="arch-arrow">
            <span>XDR relay</span>
            <div className="arch-arrow-line" />
          </div>
          <div className="arch-node">
            <span className="arch-node-icon">🤖</span>
            <span className="arch-node-label">Relayer Bot</span>
            <span className="arch-node-sub">Render (Live)</span>
          </div>
          <div className="arch-arrow">
            <span>Submit TX</span>
            <div className="arch-arrow-line" />
          </div>
          <div className="arch-node">
            <span className="arch-node-icon">🔗</span>
            <span className="arch-node-label">Soroban RPC</span>
            <span className="arch-node-sub">Stellar Testnet</span>
          </div>
        </div>
      </section>

      {/* ── Interactive Playground ── */}
      <section id="playground" className="section playground-section">
        <span className="section-label">Interactive Demo</span>
        <h2 className="section-title">Try It Yourself</h2>
        <p className="section-desc">
          Connect your Freighter wallet and send a gasless USDC transfer on
          Stellar Testnet — no XLM needed.
        </p>

        <div className="playground-layout">
          {/* Step 1 */}
          <div className={`step-card ${publicKey ? "completed" : "active"}`}>
            <div className="step-header">
              <span className={`step-number ${publicKey ? "done" : "pending"}`}>
                {publicKey ? "✓" : "1"}
              </span>
              <span className="step-title">Connect Wallet</span>
            </div>
            <p className="step-desc">
              Link your Freighter wallet to interact with Stellar Testnet.
            </p>
            {publicKey ? (
              <div className="wallet-info">
                <span className="dot" />
                <span className="address">{truncAddr(publicKey)}</span>
                {balance !== null && (
                  <span className="balance">{fmtUsdc(balance)} USDC</span>
                )}
              </div>
            ) : (
              <div className="step-actions">
                <button className="btn btn-primary btn-full" onClick={connectWallet}>
                  Connect Freighter
                </button>
              </div>
            )}
          </div>

          {/* Step 2 */}
          <div className={`step-card ${publicKey && !tokenOk ? "active" : ""}`}>
            <div className="step-header">
              <span className={`step-number ${publicKey ? (tokenOk ? "done" : "pending") : "pending"}`}>
                {publicKey && tokenOk ? "✓" : "2"}
              </span>
              <span className="step-title">Onboarding</span>
            </div>
            <p className="step-desc">
              Ensure your wallet has a USDC trustline and test tokens. In V2,
              this will be fully automated via Claimable Balances.
            </p>
            <div className="step-actions">
              <button
                className="btn btn-outline"
                onClick={() => handleOnboardingAction("usdc")}
                disabled={!publicKey}
              >
                Request Test USDC
              </button>
              <button
                className="btn btn-outline"
                onClick={() => handleOnboardingAction("trustline")}
                disabled={!publicKey}
              >
                Add Trustline
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`step-card ${publicKey && tokenOk ? "active" : ""}`}>
            <div className="step-header">
              <span className="step-number pending">3</span>
              <span className="step-title">Execute Gasless Transfer</span>
            </div>
            <p className="step-desc">
              Send 10 USDC to any Stellar address. The 0.5 USDC fee is deducted
              automatically — you pay zero XLM.
            </p>
            <div className="transfer-form">
              <div className="input-group">
                <label htmlFor="recipient">Recipient Address</label>
                <input
                  id="recipient"
                  type="text"
                  placeholder="G..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={loading || !publicKey || !tokenOk}
                />
              </div>
              <button
                className="btn btn-emerald btn-full"
                onClick={handleSend}
                disabled={loading || !recipient || needsMore || !publicKey || !tokenOk}
              >
                {loading
                  ? "Processing…"
                  : needsMore
                    ? "Insufficient USDC Balance"
                    : "Send 10 USDC (Gasless) ⚡"}
              </button>
            </div>
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className={`status-toast status-${status.type}`}>
            {status.msg}
          </div>
        )}
      </section>

      {/* ── Footer ── */}
      <footer className="site-footer">
        <div className="footer-brand">⛽ Soroban Gas Station</div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Action-Agnostic Gasless SDK for Stellar / Soroban
        </p>
        <div className="footer-links">
          <a href="https://github.com/yigitturaan/stellar-paymaster-v2" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://stellar.org" target="_blank" rel="noreferrer">
            Stellar
          </a>
          <a href="https://soroban.stellar.org" target="_blank" rel="noreferrer">
            Soroban Docs
          </a>
        </div>
        <p className="footer-copy">
          Built for the ODTU Blockchain Hackathon &middot; Powered by Soroban &amp; Stellar Testnet
        </p>
      </footer>
    </div>
  );
}

export default App;
