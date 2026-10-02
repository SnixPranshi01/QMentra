import { useState } from 'react'
import { ArrowRight, Check, Copy, ExternalLink, FlaskConical, Play } from 'lucide-react'

const practiceCode = `from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

circuit = QuantumCircuit(1, 1)
circuit.h(0)                 # create superposition
circuit.measure(0, 0)        # sample in the computational basis

result = AerSimulator().run(circuit, shots=1024).result()
print(result.get_counts())`

function QuantumLab({ onOpenLab }) {
  const [copied, setCopied] = useState(false)

  const copyExample = async () => {
    await navigator.clipboard.writeText(practiceCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="quantum-lab" id="quantum-lab">
      <div className="quantum-lab-copy">
        <div className="library-kicker"><FlaskConical size={14} /> PRACTICAL QUANTUM LAB</div>
        <h2>Turn a concept into a circuit.</h2>
        <p>Try superposition with Qiskit Aer. Apply a Hadamard gate, measure 1,024 shots, then compare the outcome counts with the histogram in the circuit builder.</p>
        <div className="lab-expectation"><span><Play size={12} fill="currentColor" /></span><div><strong>What to look for</strong><small>The counts for 0 and 1 should be close to even, with small shot-to-shot variation.</small></div></div>
        <div className="quantum-lab-actions">
          <button className="open-lab-button" onClick={onOpenLab}>Open circuit builder <ArrowRight size={14} /></button>
          <a href="https://quantum.cloud.ibm.com/docs/en/guides/local-simulators" target="_blank" rel="noreferrer">Qiskit simulator guide <ExternalLink size={12} /></a>
        </div>
      </div>
      <div className="practice-code">
        <div className="practice-code-header"><span><i /> <i /> <i /> <strong>superposition.py</strong></span><button onClick={copyExample} aria-label="Copy Qiskit example">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button></div>
        <pre><code>{practiceCode}</code></pre>
        <div className="practice-code-result"><span>EXAMPLE OUTPUT · 1,024 SHOTS</span><code>{'{"0": 516, "1": 508}'}</code><small>Counts vary each time the simulator runs.</small></div>
      </div>
    </section>
  )
}

export default QuantumLab