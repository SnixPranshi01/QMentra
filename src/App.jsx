import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDown, ArrowUpRight, BookOpen, Bot, Check, ChevronDown,
  CircleHelp, Clock3, Code2, Command, Copy, FileCode2, FlaskConical,
  Gauge, GraduationCap, Layers3, Menu, MoreHorizontal, Play, Plus,
  RotateCcw, Search, Send, Settings2, ShieldCheck, Sparkles, Terminal,
  Trash2, X, Zap,
} from 'lucide-react'
import './App.css'
import ConceptLibrary from './ConceptLibrary.jsx'
import QuantumLab from './QuantumLab.jsx'
import QuantumSymbol from './QuantumSymbol.jsx'

const initialGates = [
  { id: 1, name: 'H', qubit: 0 },
  { id: 2, name: 'X', qubit: 1 },
  { id: 3, name: 'CX', qubit: 1, control: 0 },
]

const lessons = [
  { title: 'The qubit', chapter: '01', time: '8 min', done: true },
  { title: 'Superposition', chapter: '02', time: '12 min', current: true },
  { title: 'Quantum gates', chapter: '03', time: '15 min' },
  { title: 'Entanglement', chapter: '04', time: '18 min' },
]

const gateHelp = {
  H: 'Creates an equal superposition of |0> and |1>.',
  X: 'Flips the qubit: |0> becomes |1>, and vice versa.',
  Z: 'Changes the phase of the |1> state.',
  CX: 'Flips the target when the control qubit is |1>.',
}

function simulateLocally(gates, qubits, shots) {
  const size = 2 ** qubits
  const state = Array.from({ length: size }, (_, index) => [index === 0 ? 1 : 0, 0])
  const strideFor = (qubit) => 2 ** qubit
  gates.forEach((gate) => {
    if (gate.name === 'H') {
      const stride = strideFor(gate.qubit)
      for (let base = 0; base < size; base += stride * 2) {
        for (let offset = 0; offset < stride; offset += 1) {
          const first = base + offset
          const second = first + stride
          const [aReal, aImag] = state[first]
          const [bReal, bImag] = state[second]
          state[first] = [(aReal + bReal) / Math.SQRT2, (aImag + bImag) / Math.SQRT2]
          state[second] = [(aReal - bReal) / Math.SQRT2, (aImag - bImag) / Math.SQRT2]
        }
      }
    } else if (gate.name === 'X') {
      const stride = strideFor(gate.qubit)
      for (let index = 0; index < size; index += 1) {
        if ((index & stride) === 0) [state[index], state[index | stride]] = [state[index | stride], state[index]]
      }
    } else if (gate.name === 'Z') {
      const stride = strideFor(gate.qubit)
      for (let index = 0; index < size; index += 1) {
        if (index & stride) state[index] = [-state[index][0], -state[index][1]]
      }
    } else if (gate.name === 'CX') {
      const control = strideFor(gate.control ?? 0)
      const target = strideFor(gate.qubit)
      for (let index = 0; index < size; index += 1) {
        if ((index & control) && !(index & target)) [state[index], state[index | target]] = [state[index | target], state[index]]
      }
    }
  })
  const probabilities = state.map(([real, imaginary]) => real ** 2 + imaginary ** 2)
  const counts = {}
  for (let shot = 0; shot < shots; shot += 1) {
    let value = Math.random()
    let outcome = probabilities.length - 1
    for (let index = 0; index < probabilities.length; index += 1) {
      value -= probabilities[index]
      if (value <= 0) { outcome = index; break }
    }
    const bitstring = outcome.toString(2).padStart(qubits, '0')
    counts[bitstring] = (counts[bitstring] ?? 0) + 1
  }
  return { shots, counts, unique_states: Object.keys(counts).length, backend: 'Local statevector' }
}

function buildQiskitCode(gates, qubits, shots) {
  const lines = [
    'from qiskit import QuantumCircuit',
    'from qiskit_aer import AerSimulator',
    '',
    `qc = QuantumCircuit(${qubits}, ${qubits})`,
  ]
  gates.forEach((gate) => {
    if (gate.name === 'CX') lines.push(`qc.cx(${gate.control ?? 0}, ${gate.qubit})`)
    else lines.push(`qc.${gate.name.toLowerCase()}(${gate.qubit})`)
  })
  lines.push('', `qc.measure(range(${qubits}), range(${qubits}))`, '', `result = AerSimulator().run(qc, shots=${shots}).result()`, 'print(result.get_counts())')
  return lines.join('\n')
}

function parseQiskitSnippet(source) {
  let qubits = null
  let shots = 512
  let measured = false
  const gates = []
  const allowedLines = new Set([
    'from qiskit import QuantumCircuit',
    'from qiskit_aer import AerSimulator',
    'print(result.get_counts())',
  ])

  source.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || allowedLines.has(line)) return
    let match = line.match(/^qc\s*=\s*QuantumCircuit\(\s*(\d+)\s*,\s*\d+\s*\)$/)
    if (match) {
      qubits = Number(match[1])
      return
    }
    match = line.match(/^qc\.(h|x|z)\(\s*(\d+)\s*\)$/)
    if (match) {
      gates.push({ name: match[1].toUpperCase(), qubit: Number(match[2]) })
      return
    }
    match = line.match(/^qc\.cx\(\s*(\d+)\s*,\s*(\d+)\s*\)$/)
    if (match) {
      gates.push({ name: 'CX', control: Number(match[1]), qubit: Number(match[2]) })
      return
    }
    match = line.match(/^qc\.measure\(range\(\s*(\d+)\s*\),\s*range\(\s*(\d+)\s*\)\)$/)
    if (match) {
      measured = match[1] === match[2]
      return
    }
    match = line.match(/^result\s*=\s*AerSimulator\(\)\.run\(qc,\s*shots\s*=\s*(\d+)\)\.result\(\)$/)
    if (match) {
      shots = Number(match[1])
      return
    }
    throw new Error(`Unsupported Qiskit statement on line ${index + 1}`)
  })

  if (!qubits || qubits < 1 || qubits > 5) throw new Error('Declare between 1 and 5 qubits with QuantumCircuit(n, n).')
  if (!measured) throw new Error('Add qc.measure(range(n), range(n)) before running the circuit.')
  if (shots < 1 || shots > 4096) throw new Error('Shots must be between 1 and 4,096.')
  for (const gate of gates) {
    if (gate.qubit >= qubits || (gate.name === 'CX' && (gate.control >= qubits || gate.control === gate.qubit))) {
      throw new Error('A gate references an invalid qubit index.')
    }
  }
  return { qubits, shots, gates }
}

function LearningLoop({ onNavigate }) {
  const stages = [
    { number: '01', label: 'LEARN', title: 'Quantum concepts', icon: BookOpen, target: 'quantum-concepts', nav: 'Quantum Concepts', position: 'loop-learn' },
    { number: '02', label: 'BUILD', title: 'Interactive circuit', icon: Layers3, target: 'circuit-builder', nav: 'Circuit Builder', position: 'loop-build' },
    { number: '03', label: 'RUN / SIMULATE', title: 'Circuit simulator', icon: Play, target: 'quantum-lab', nav: 'Quantum Lab', position: 'loop-run' },
    { number: '04', label: 'ASSESS', title: 'Quiz + code analysis', icon: Check, target: 'assessments', nav: 'Assessments', position: 'loop-assess' },
    { number: '05', label: 'PERSONALIZE', title: 'AI mentor + progress', icon: Bot, target: 'ai-suggestions', nav: 'AI Suggestions', position: 'loop-personalize' },
    { number: '06', label: 'TRACK', title: 'Progress tracker', icon: Activity, target: 'personal-tracker', nav: 'Personal Tracker', position: 'loop-progress' },
  ]

  return (
    <section className="learning-loop" aria-label="QMentra learning loop">
      <header className="loop-heading">
        <div><span className="section-kicker">ONE CONNECTED LEARNING PATH</span><h2>Learn it. Build it. Run it.</h2></div>
        <span className="loop-status"><span /> 6 linked stages</span>
      </header>
      <div className="loop-map">
        {stages.map(({ number, label, title, icon: Icon, target, nav, position }) => (
          <button key={number} className={`loop-stage ${position}`} onClick={() => onNavigate({ title: nav, target })}>
            <span className="loop-stage-icon"><Icon size={16} /></span>
            <span className="loop-stage-copy"><small>{number} · {label}</small><strong>{title}</strong></span>
            <ArrowUpRight className="loop-stage-arrow" size={14} />
          </button>
        ))}
        <div className="loop-hub"><QuantumSymbol /><strong>QMENTRA</strong><small>quantum learning</small></div>
      </div>
    </section>
  )
}

function App() {
  const [gates, setGates] = useState(initialGates)
  const [qubits, setQubits] = useState(3)
  const [shots, setShots] = useState(512)
  const [activeTab, setActiveTab] = useState('circuit')
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [apiConnected, setApiConnected] = useState(false)
  const [activeNav, setActiveNav] = useState('Circuit Builder')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [tutorQuestion, setTutorQuestion] = useState('')
  const [tutorReply, setTutorReply] = useState('Try measuring the circuit before and after the Hadamard gate. What changes about the outcomes?')
  const [notice, setNotice] = useState('')
  const qiskitCode = useMemo(() => buildQiskitCode(gates, qubits, shots), [gates, qubits, shots])
  const [codeDraft, setCodeDraft] = useState(qiskitCode)

  useEffect(() => {
    setCodeDraft(qiskitCode)
  }, [qiskitCode])

  const addGate = (name, qubit = name === 'CX' && qubits > 1 ? 1 : 0) => {
    if (name === 'CX' && qubits < 2) {
      setNotice('Controlled-X requires at least two qubits')
      return
    }
    const target = Math.min(qubit, qubits - 1)
    setGates((current) => [...current, { id: Date.now() + Math.random(), name, qubit: target, ...(name === 'CX' ? { control: target === 0 ? 1 : 0 } : {}) }])
    setRunResult(null)
  }

  const dropGate = (event, qubit) => {
    event.preventDefault()
    const name = event.dataTransfer.getData('gate')
    if (name) addGate(name, qubit)
  }

  const runCircuit = async (circuit = { qubits, shots, gates }) => {
    setRunning(true)
    setNotice('')
    try {
      const response = await fetch('/api/v1/circuits/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(circuit),
      })
      if (!response.ok) throw new Error('Simulation service unavailable')
      setApiConnected(true)
      setRunResult(await response.json())
    } catch {
      setApiConnected(false)
      setRunResult(simulateLocally(circuit.gates, circuit.qubits, circuit.shots))
      setNotice('API offline · showing local statevector results')
    } finally {
      setRunning(false)
    }
  }

  const runCode = async () => {
    try {
      await runCircuit(parseQiskitSnippet(codeDraft))
    } catch (error) {
      setNotice(error.message)
    }
  }

  const askTutor = async (event) => {
    event.preventDefault()
    if (!tutorQuestion.trim()) return
    const question = tutorQuestion.trim()
    setTutorQuestion('')
    try {
      const response = await fetch('/api/v1/tutor/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: { gates, lesson: 'Superposition' } }),
      })
      if (!response.ok) throw new Error('Tutor unavailable')
      setTutorReply((await response.json()).answer)
    } catch {
      const hasHadamard = gates.some((gate) => gate.name === 'H')
      const hasControl = gates.some((gate) => gate.name === 'CX')
      setTutorReply(hasControl
        ? 'Your circuit includes a controlled-X gate. Compare outcomes with and without the control qubit in superposition to see how entanglement changes the distribution.'
        : hasHadamard
          ? 'Your Hadamard gate creates an equal superposition before measurement. Try adding an X gate after it: the probabilities stay equal, but the phase relationships change.'
          : 'Try adding an H gate to q0, then run the circuit. You should see the measurement outcomes split between 0 and 1 instead of staying in a single state.')
    }
  }

  const copyCode = async () => {
    await navigator.clipboard.writeText(qiskitCode)
    setNotice('Qiskit code copied')
    window.setTimeout(() => setNotice(''), 1800)
  }

  const navItems = [
    { title: 'Quantum Concepts', icon: BookOpen, target: 'quantum-concepts' },
    { title: 'Quantum Lab', icon: FlaskConical, target: 'quantum-lab' },
    { title: 'Circuit Builder', icon: Layers3, target: 'circuit-builder' },
    { title: 'Code Workspace', icon: Code2, target: 'code-workspace' },
    { title: 'Circuit Simulation', icon: Activity, target: 'circuit-simulation' },
    { title: 'AI Suggestions', icon: Bot, target: 'ai-suggestions' },
    { title: 'Dashboard', icon: Gauge, target: 'dashboard' },
    { title: 'Assessments', icon: Check, target: 'assessments' },
    { title: 'Personal Tracker', icon: GraduationCap, target: 'personal-tracker' },
  ]
  const navigateTo = (item) => {
    setActiveNav(item.title)
    setMobileNavOpen(false)
    document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const bars = runResult?.counts
    ? Object.entries(runResult.counts).sort(([a], [b]) => a.localeCompare(b)).slice(0, 8)
    : []
  const maxCount = Math.max(...bars.map(([, count]) => count), 1)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#home" aria-label="QMentra home"><span className="brand-mark"><span /><span /><span /></span><span>qmentra<span className="brand-period">.</span></span></a>
        <div className="workspace-select"><div className="workspace-avatar">Q</div><div><strong>Quantum foundations</strong><small>Learning path</small></div><ChevronDown size={14} /></div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="main-nav" aria-label="Main navigation">{navItems.map(({ title, icon: Icon, target }) => <button key={title} className={`nav-item ${activeNav === title ? 'nav-active' : ''}`} onClick={() => navigateTo({ title, target })}><Icon size={16} strokeWidth={1.8} /><span>{title}</span>{title === 'Circuit Builder' && <span className="nav-dot" />}</button>)}</nav>
        <div className="sidebar-divider" />
        <div className="course-heading"><span className="nav-label">YOUR COURSE</span><button aria-label="Course options"><MoreHorizontal size={17} /></button></div>
        <div className="lesson-list">{lessons.map((lesson) => <button className={`lesson-item ${lesson.current ? 'lesson-current' : ''}`} key={lesson.chapter}><span className={`lesson-number ${lesson.done ? 'lesson-done' : ''}`}>{lesson.done ? <Check size={12} /> : lesson.chapter}</span><span className="lesson-copy"><strong>{lesson.title}</strong><small>{lesson.time}</small></span>{lesson.current && <span className="lesson-now" />}</button>)}</div>
        <div className="sidebar-bottom"><div className="streak-card"><div className="streak-icon"><Zap size={15} fill="currentColor" /></div><div><strong>4 day streak</strong><small>You’re building a habit</small></div><ArrowUpRight size={15} /></div><button className="profile-button"><div className="profile-avatar">AL</div><span><strong>Alex Lee</strong><small>Researcher plan</small></span><MoreHorizontal size={17} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen((open) => !open)}><Menu size={19} /></button><div className="breadcrumbs"><span>Learning path</span><span className="crumb-slash">/</span><span>Quantum foundations</span><span className="crumb-slash">/</span><strong>Lab</strong></div><div className="topbar-actions"><button className="search-button"><Search size={15} /><span>Search anything</span><kbd><Command size={10} /> K</kbd></button><button className="help-button" aria-label="Help"><CircleHelp size={18} /></button><div className="online-status"><span /> {apiConnected ? 'API connected' : 'Local mode'}</div></div></header>
        <div className="page-content">
          <LearningLoop onNavigate={navigateTo} />
          <ConceptLibrary />
          <QuantumLab onOpenLab={() => navigateTo({ title: 'Circuit Builder', target: 'circuit-builder' })} />
          <div className="lab-layout">
            <section className="workbench" id="circuit-builder" aria-label="Quantum circuit workbench">
              <div className="workbench-header"><div className="workbench-title"><div className="workbench-icon"><Layers3 size={16} /></div><div><h2>Circuit studio</h2><p>Build a circuit and see the state evolve</p></div></div><button className="icon-button" aria-label="Circuit settings"><Settings2 size={17} /></button></div>
              <div className="studio-toolbar"><div className="view-tabs" role="tablist"><button role="tab" aria-selected={activeTab === 'circuit'} className={activeTab === 'circuit' ? 'view-tab active-tab' : 'view-tab'} onClick={() => setActiveTab('circuit')}><Layers3 size={14} /> Circuit</button><button role="tab" aria-selected={activeTab === 'code'} className={activeTab === 'code' ? 'view-tab active-tab' : 'view-tab'} onClick={() => setActiveTab('code')}><Code2 size={14} /> Code</button></div><div className="toolbar-actions"><span className="autosaved"><span /> Saved</span><button className="icon-button" aria-label="Undo"><RotateCcw size={15} /></button><button className="icon-button" aria-label="More circuit actions"><MoreHorizontal size={17} /></button></div></div>
              {activeTab === 'circuit' ? <div className="circuit-panel"><div className="gate-palette"><div className="palette-label">GATES <span>DRAG TO ADD</span></div><div className="gate-buttons">{['H', 'X', 'Z', 'CX'].map((name) => <button className={`gate-chip gate-${name.toLowerCase()}`} key={name} draggable title={gateHelp[name]} onDragStart={(event) => event.dataTransfer.setData('gate', name)} onClick={() => addGate(name)}><span>{name === 'CX' ? '⊕' : name}</span><small>{name}</small></button>)}</div></div>
                <div className="circuit-controls"><span className="control-label">QUBITS</span><button className="stepper" onClick={() => { setQubits((count) => Math.max(1, count - 1)); setGates((items) => items.filter((gate) => gate.qubit < qubits - 1 && (gate.control ?? 0) < qubits - 1)) }} aria-label="Remove qubit"><span>−</span></button><strong>{qubits}</strong><button className="stepper" onClick={() => setQubits((count) => Math.min(5, count + 1))} aria-label="Add qubit"><Plus size={13} /></button><span className="control-divider" /><span className="control-label">SHOTS</span><select value={shots} onChange={(event) => setShots(Number(event.target.value))} aria-label="Simulation shots"><option value={128}>128</option><option value={512}>512</option><option value={1024}>1,024</option><option value={2048}>2,048</option></select></div>
                <div className="circuit-canvas"><div className="circuit-ruler"><span>INPUT</span>{gates.map((gate, index) => <span key={gate.id}>{String(index + 1).padStart(2, '0')}</span>)}<span>MEASURE</span></div>{Array.from({ length: qubits }, (_, qubit) => <div className="qubit-row" key={qubit} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropGate(event, qubit)}><span className="qubit-label">q<sub>{qubit}</sub></span><div className="qubit-wire"><span className="state-token">|0⟩</span>{gates.map((gate) => gate.qubit === qubit ? <button key={gate.id} title={`${gateHelp[gate.name]} Click to remove`} onClick={() => { setGates((items) => items.filter((item) => item.id !== gate.id)); setRunResult(null) }} className={`placed-gate placed-${gate.name.toLowerCase()}`}>{gate.name === 'CX' ? '⊕' : gate.name}<span className="gate-remove"><X size={10} /></span></button> : gate.name === 'CX' && gate.control === qubit ? <span key={gate.id} className="control-dot" title="Controlled-X control" /> : null)}<span className="measure-gate">M</span></div></div>)}{gates.some((gate) => gate.name === 'CX') && <div className="entangle-note"><span /> Controlled operation · CX</div>}</div>
                <div className="canvas-foot"><span><span className="drop-indicator" /> Drop a gate onto any qubit wire</span><button onClick={() => { setGates([]); setRunResult(null) }}><Trash2 size={13} /> Clear circuit</button></div></div> : <div className="code-panel"><div className="code-header"><span><FileCode2 size={14} /> circuit.py</span><button onClick={copyCode}><Copy size={13} /> Copy code</button></div><pre>{qiskitCode.split('\n').map((line, index) => <div className="code-line" key={`${index}-${line}`}><span className="line-number">{index + 1}</span><code>{line || ' '}</code></div>)}</pre><div className="code-note"><Terminal size={13} /> Generated from your circuit · Qiskit Aer</div></div>}
              <div className="runbar"><div className="simulator-label"><span className="simulator-mark"><Activity size={13} /></span><span><strong>{runResult?.backend ?? 'Local simulator'}</strong><small>{apiConnected ? 'Qiskit Aer · ideal' : 'Statevector preview · ideal'}</small></span><ChevronDown size={13} /></div><button className="run-button" onClick={runCircuit} disabled={running || gates.length === 0}>{running ? <span className="spinner" /> : <Play size={14} fill="currentColor" />} {running ? 'Running' : 'Run circuit'}</button></div>
            </section>
            <aside className="insight-column">
              <section className="results-panel" id="circuit-simulation"><div className="panel-heading"><div><span className="section-kicker">SIMULATION</span><h2>Measurement results</h2></div><button className="icon-button" aria-label="Results options"><MoreHorizontal size={17} /></button></div><div className="result-summary"><div className="result-count"><strong>{runResult?.shots ?? shots}</strong><span>total shots</span></div><div className="result-separator" /><div className="result-count"><strong>{runResult?.unique_states ?? '—'}</strong><span>states observed</span></div></div><div className="histogram" role="img" aria-label="Measurement outcomes histogram">{bars.length ? bars.map(([state, count], index) => <div className="histogram-column" key={state}><span className="bar-count">{count}</span><div className={`histogram-bar ${index % 2 === 1 ? 'bar-highlight' : ''}`} style={{ height: `${Math.max(8, (count / maxCount) * 100)}%` }} /><span className="bar-label">{state}</span></div>) : <div className="empty-chart">Run your circuit to view measurement outcomes</div>}</div><div className="chart-caption"><span><i /> Probability distribution</span><button><Gauge size={13} /> {runResult?.backend ?? 'Qiskit Aer'}</button></div>{notice && <div className={`notice ${notice.startsWith('API offline') ? 'notice-warn' : ''}`}>{notice}</div>}</section>
              <section className="tutor-panel" id="ai-suggestions"><div className="tutor-header"><div className="tutor-avatar"><Bot size={17} /></div><div><h2>AI suggestions</h2><span><i /> Ready to explore</span></div><button className="icon-button" aria-label="Tutor options"><MoreHorizontal size={17} /></button></div><div className="tutor-context"><Sparkles size={12} /> ABOUT THIS CIRCUIT</div><p className="tutor-reply">{tutorReply}</p><div className="tutor-suggestion"><button onClick={() => setTutorQuestion('Why does the Hadamard gate create superposition?')}>Why does H create superposition? <ArrowUpRight size={12} /></button></div><form className="tutor-input" onSubmit={askTutor}><input value={tutorQuestion} onChange={(event) => setTutorQuestion(event.target.value)} placeholder="Ask about your circuit..." aria-label="Ask the lab tutor" /><button aria-label="Send question" disabled={!tutorQuestion.trim()}><Send size={14} /></button></form><div className="tutor-disclaimer"><ShieldCheck size={12} /> AI responses can make mistakes</div></section>
              <section className="next-step"><div className="next-step-icon"><BookOpen size={15} /></div><div><span className="section-kicker">UP NEXT · 15 MIN</span><strong>Quantum gates</strong></div><button aria-label="Go to next lesson"><ArrowDown size={15} /></button></section>
            </aside>
          </div>
          <section className="code-workspace" id="code-workspace">
            <div className="code-workspace-heading"><div><span className="section-kicker"><Code2 size={13} /> QISKIT PLAYGROUND</span><h2>Run your circuit code</h2><p>Edit the supported Qiskit circuit, run it safely in the lab, and inspect measurement counts.</p></div><span className="workspace-runtime"><span /> SPA simulator</span></div>
            <div className="code-workspace-grid">
              <div className="workspace-editor"><div className="code-header"><span><FileCode2 size={14} /> circuit.py</span><button onClick={() => setCodeDraft(qiskitCode)}><RotateCcw size={12} /> Reset from builder</button></div><textarea aria-label="Editable Qiskit circuit code" spellCheck="false" value={codeDraft} onChange={(event) => setCodeDraft(event.target.value)} /><div className="workspace-editor-note"><ShieldCheck size={12} /> Safe runner accepts H, X, Z, CX, measurement, and shot count. Python is not executed directly.</div></div>
              <div className="workspace-output"><div className="code-header"><span><Terminal size={14} /> Run output</span><span className="output-state">{running ? 'Running…' : runResult ? `${runResult.shots} shots` : 'Waiting for run'}</span></div><pre>{runResult ? Object.entries(runResult.counts).sort(([left], [right]) => left.localeCompare(right)).map(([state, count]) => `${state}   ${count}  (${(count / runResult.shots * 100).toFixed(1)}%)`).join('\n') : 'Measurement counts will appear here.'}</pre>{notice && <div className={`notice ${notice.startsWith('API offline') ? 'notice-warn' : ''}`}>{notice}</div>}</div>
            </div>
            <div className="code-workspace-actions"><button className="run-button" onClick={runCode} disabled={running}>{running ? <span className="spinner" /> : <Play size={13} fill="currentColor" />} Run code in lab</button><span>Runs only the circuit operations above; arbitrary Python is never evaluated.</span></div>
          </section>
          <section className="data-section" id="dashboard"><div className="data-heading"><div><span className="section-kicker">YOUR LEARNING DASHBOARD</span><h2>A little progress, every day.</h2><p>See your learning activity across the quantum foundations path.</p></div><button><Activity size={13} /> This week <ChevronDown size={12} /></button></div><div className="dashboard-metrics"><div className="metric-tile"><span>Course progress</span><strong>38%</strong><small>+8% this week</small></div><div className="metric-tile"><span>Study time</span><strong>4.2h</strong><small>Across 5 sessions</small></div><div className="metric-tile"><span>Circuits run</span><strong>{runResult ? '13' : '12'}</strong><small>2 more than last week</small></div><div className="metric-tile"><span>Quiz average</span><strong>86%</strong><small>Across 3 assessments</small></div></div><div className="dashboard-bottom"><div className="mini-chart"><h3>Learning minutes</h3><div className="weekly-chart">{[['M',34],['T',58],['W',43],['T',78],['F',50],['S',27],['S',12]].map(([day,height],index)=><div className="weekly-item" key={`${day}-${index}`}><i style={{height:`${height}%`}} />{day}</div>)}</div></div><div className="activity-list"><h3>Recent activity</h3><div className="activity-row"><span><FlaskConical size={12} /></span>Ran a 3-qubit circuit<strong>Today</strong></div><div className="activity-row"><span><BookOpen size={12} /></span>Completed “The qubit”<strong>Yesterday</strong></div><div className="activity-row"><span><Check size={12} /></span>Scored 4/5 on quiz<strong>Sep 29</strong></div></div></div></section>
          <section className="data-section" id="assessments"><div className="data-heading"><div><span className="section-kicker">CONCEPT ASSESSMENTS</span><h2>One check for every concept.</h2><p>Assessment follows the article sequence, from foundations through quantum algorithms.</p></div><button><Check size={13} /> 29 concept checks</button></div><div className="assessment-overview"><div className="assessment-step"><span>01</span><div><strong>Concept article</strong><small>Build the core idea</small></div></div><div className="assessment-step"><span>02</span><div><strong>Knowledge check</strong><small>Answer a concept quiz</small></div></div><div className="assessment-step"><span>03</span><div><strong>Next concept</strong><small>Unlock after a pass</small></div></div></div><div className="assessment-overview-action"><span>Each concept has its own quiz and explanation.</span><button onClick={() => navigateTo({ title: 'Quantum Concepts', target: 'quantum-concepts' })}>Open concept path <ArrowUpRight size={13} /></button></div></section>
          <section className="data-section" id="personal-tracker"><div className="data-heading"><div><span className="section-kicker">PERSONAL TRACKER</span><h2>Your learning rhythm</h2><p>Small, consistent sessions build lasting intuition.</p></div><button><Zap size={13} /> 4-day streak</button></div><div className="tracker-grid"><div className="tracker-heatmap"><h3>Study activity · last 14 weeks</h3><div className="heatmap-weeks">{Array.from({length:98},(_,index)=><span key={index} className={`heatmap-cell ${index%13===0||index%9===2?'level-3':index%7===0||index%5===1?'level-2':index%3===1?'level-1':''}`} />)}</div><div className="heatmap-legend">Less <i /><i /><i /><i /> More</div></div><div className="tracker-goals"><h3>Weekly goals</h3><div className="goal-row"><span>Study sessions</span><strong>4 / 5</strong></div><div className="goal-track"><span style={{width:'80%'}} /></div><div className="goal-row"><span>Lessons completed</span><strong>3 / 4</strong></div><div className="goal-track"><span style={{width:'75%'}} /></div><div className="goal-row"><span>Circuits explored</span><strong>12 / 10</strong></div><div className="goal-track"><span style={{width:'100%'}} /></div></div></div></section>
          <footer className="page-footer"><span>QMENTRA LAB <i /> SESSION 04</span><span>Sandboxed environment <ShieldCheck size={12} /></span><button><CircleHelp size={12} /> Feedback</button></footer>
        </div>
      </main>
    </div>
  )
}

export default App
