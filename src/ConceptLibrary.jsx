import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, BookOpen, Check, CheckCircle2, Clock3, Lock, Search, X } from 'lucide-react'
import catalog from '../data/quantum_concepts.json'
import assessmentBank from '../data/quantum_assessments.json'

const categories = ['All concepts', ...new Set(catalog.map((article) => article.category))]
const completedStorageKey = 'qmentra-completed-concepts'
const passedStorageKey = 'qmentra-passed-concepts'

function readStoredSlugs(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function ConceptLibrary() {
  const [articles, setArticles] = useState(catalog)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All concepts')
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [completedSlugs, setCompletedSlugs] = useState(() => readStoredSlugs(completedStorageKey))
  const [passedSlugs, setPassedSlugs] = useState(() => readStoredSlugs(passedStorageKey))
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [quizMessage, setQuizMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/concepts', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (Array.isArray(data) && data.length) setArticles(data) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/progress/concepts', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        if (!Array.isArray(data) || !data.length) return
        const completed = data.filter((item) => item.completed).map((item) => item.slug)
        const passed = data.filter((item) => item.assessment_passed).map((item) => item.slug)
        setCompletedSlugs(completed)
        setPassedSlugs(passed)
        localStorage.setItem(completedStorageKey, JSON.stringify(completed))
        localStorage.setItem(passedStorageKey, JSON.stringify(passed))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const orderedArticles = useMemo(() => {
    const articlesBySlug = new Map(articles.map((article) => [article.slug, article]))
    return catalog.map((article) => articlesBySlug.get(article.slug)).filter(Boolean)
  }, [articles])

  const isConceptUnlocked = (articleIndex) => articleIndex === 0 || passedSlugs.includes(orderedArticles[articleIndex - 1]?.slug)
  const unlockedCount = orderedArticles.filter((_, index) => isConceptUnlocked(index)).length
  const passedCount = orderedArticles.filter((article) => passedSlugs.includes(article.slug)).length

  const markComplete = async (article) => {
    if (completedSlugs.includes(article.slug)) return
    const nextSlugs = [...completedSlugs, article.slug]
    setCompletedSlugs(nextSlugs)
    localStorage.setItem(completedStorageKey, JSON.stringify(nextSlugs))
    try {
      await fetch(`/api/v1/progress/concepts/${article.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed, user_id: 'demo-student' }),
      })
    } catch {}
  }

  const selectArticle = (article) => {
    setSelectedArticle(article)
    setSelectedAnswer(null)
    setQuizMessage('')
  }

  const submitQuiz = async (assessment) => {
    if (selectedAnswer === null || submitting) return
    setSubmitting(true)
    let result = {
      correct: selectedAnswer === assessment.correct_index,
      explanation: assessment.explanation,
    }
    try {
      const response = await fetch(`/api/v1/assessments/${assessment.slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer_index: selectedAnswer, user_id: 'demo-student' }),
      })
      if (response.ok) {
        result = await response.json()
      } else {
        const problem = await response.json().catch(() => ({}))
        result = { correct: false, explanation: problem.detail || 'The quiz could not be verified. Try again.' }
      }
    } catch {}
    setSubmitting(false)
    setQuizMessage(`${result.correct ? 'Correct.' : 'Not quite.'} ${result.explanation}`)
    if (result.passed || result.correct) {
      const nextSlugs = [...new Set([...passedSlugs, assessment.slug])]
      setPassedSlugs(nextSlugs)
      localStorage.setItem(passedStorageKey, JSON.stringify(nextSlugs))
    }
  }

  const filteredArticles = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orderedArticles.filter((article) => {
      const inCategory = activeCategory === 'All concepts' || article.category === activeCategory
      const searchableText = `${article.title} ${article.summary} ${article.tags.join(' ')}`.toLowerCase()
      return inCategory && (!query || searchableText.includes(query))
    })
  }, [activeCategory, orderedArticles, search])

  if (selectedArticle) {
    const selectedIndex = orderedArticles.findIndex((article) => article.slug === selectedArticle.slug)
    const assessment = assessmentBank.find((item) => item.slug === selectedArticle.slug)
    const articleCompleted = completedSlugs.includes(selectedArticle.slug)
    const assessmentPassed = passedSlugs.includes(selectedArticle.slug)
    const nextArticle = orderedArticles[selectedIndex + 1]
    return (
      <section className="concept-library concept-reader" id="quantum-concepts">
        <button className="reader-back" onClick={() => { setSelectedArticle(null); setSelectedAnswer(null); setQuizMessage('') }}><ArrowLeft size={15} /> All concepts</button>
        <div className="reader-heading">
          <span className="article-category">{selectedArticle.category}</span>
          <h1>{selectedArticle.title}</h1>
          <p>{selectedArticle.summary}</p>
          <div className="article-meta"><span>{selectedArticle.level}</span><span><Clock3 size={13} /> {selectedArticle.minutes} min read</span></div>
        </div>
        <article className="article-body">{selectedArticle.content.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article>
        <div className="article-actions"><button className={articleCompleted ? 'article-complete is-complete' : 'article-complete'} onClick={() => markComplete(selectedArticle)} disabled={articleCompleted}>{articleCompleted ? <><Check size={13} /> Concept complete</> : 'Complete concept to unlock quiz'}</button><span>{articleCompleted ? 'Complete the check below to unlock the next concept.' : 'Read through the concept, then mark it complete to open its quiz.'}</span></div>
        {assessment && <section className={`concept-quiz ${!articleCompleted ? 'quiz-locked' : ''}`} aria-label={`${selectedArticle.title} assessment`}>
          <div className="quiz-heading"><span className="quiz-icon">{articleCompleted ? <CheckCircle2 size={16} /> : <Lock size={15} />}</span><div><span className="section-kicker">CONCEPT CHECK</span><h2>{assessmentPassed ? 'Quiz passed' : articleCompleted ? 'Check your understanding' : 'Quiz locked'}</h2></div></div>
          {articleCompleted ? <>
            <p className="quiz-question">{assessment.question}</p>
            <div className="quiz-options">{assessment.options.map((option, index) => <button key={option} className={`quiz-option ${selectedAnswer === index ? 'quiz-option-selected' : ''} ${assessmentPassed && index === assessment.correct_index ? 'quiz-option-correct' : ''}`} onClick={() => { if (!assessmentPassed) { setSelectedAnswer(index); setQuizMessage('') } }} disabled={assessmentPassed}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
            <div className="quiz-footer"><button className="quiz-submit" onClick={() => submitQuiz(assessment)} disabled={selectedAnswer === null || submitting || assessmentPassed}>{submitting ? 'Checking…' : assessmentPassed ? 'Passed' : 'Check answer'}</button>{quizMessage && <p className={assessmentPassed ? 'quiz-feedback quiz-feedback-correct' : 'quiz-feedback'} role="status">{quizMessage}</p>}</div>
            {assessmentPassed && nextArticle && <button className="next-concept-button" onClick={() => selectArticle(nextArticle)}>Next concept: {nextArticle.title} <ArrowUpRight size={14} /></button>}
            {assessmentPassed && !nextArticle && <p className="course-complete-note">You passed the final concept check. Course complete.</p>}
          </> : <p className="quiz-lock-copy">Complete this article to unlock its quiz. Pass the quiz to open the next concept.</p>}
        </section>}
        <div className="article-tags">{selectedArticle.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <section className="source-list"><span className="source-heading">Continue learning from the original sources</span>{selectedArticle.sources.map((source) => <a key={source.provider} href={source.url} target="_blank" rel="noreferrer"><span><strong>{source.provider}</strong><small>{source.label}</small></span><ArrowUpRight size={15} /></a>)}</section>
      </section>
    )
  }

  return (
    <section className="concept-library" id="quantum-concepts">
      <header className="library-heading">
        <div className="library-kicker"><BookOpen size={14} /> QMENTRA FIELD GUIDE</div>
        <h1>Quantum concepts, clearly explained.</h1>
        <p>Original, hands-on articles for building intuition from qubits to algorithms.</p>
        <div className="library-stats"><strong>{articles.length}</strong> articles <span /><strong>{unlockedCount}/{articles.length}</strong> unlocked <span /><strong>{passedCount}</strong> quizzes passed <span /> IBM Quantum + Google Quantum AI references</div>
      </header>
      <div className="library-controls">
        <label className="library-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search concepts, gates, algorithms..." aria-label="Search quantum concept articles" />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}</label>
        <span className="result-total">{filteredArticles.length} articles</span>
      </div>
      <div className="category-filters" role="group" aria-label="Filter articles by category">{categories.map((category) => <button key={category} className={activeCategory === category ? 'category-filter category-selected' : 'category-filter'} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
      {filteredArticles.length ? <div className="article-grid">{filteredArticles.map((article) => {
        const articleIndex = orderedArticles.findIndex((item) => item.slug === article.slug)
        const unlocked = isConceptUnlocked(articleIndex)
        const passed = passedSlugs.includes(article.slug)
        return <button className={`article-card ${unlocked ? '' : 'article-card-locked'}`} key={article.slug} onClick={() => selectArticle(article)} disabled={!unlocked} aria-label={`${article.title}${unlocked ? '' : ', locked until previous quiz is passed'}`}>
          <span className="article-card-top"><span className="article-category">{article.category}</span><span className="article-index">{unlocked ? String(articleIndex + 1).padStart(2, '0') : <Lock size={12} />}</span></span>
          <strong className="article-title">{article.title}</strong><span className="article-summary">{article.summary}</span>
          <span className="article-card-bottom"><span>{passed ? 'Quiz passed' : completedSlugs.includes(article.slug) ? 'Quiz unlocked' : unlocked ? article.level : 'Locked · pass previous quiz'}</span><span><Clock3 size={12} /> {article.minutes} min</span>{unlocked ? <ArrowUpRight size={14} /> : <Lock size={12} />}</span>
        </button>
      })}</div> : <div className="library-empty">No articles match that search. Try another concept or category.</div>}
      <footer className="library-note">QMentra articles are independently written. References link to official IBM Quantum and Google Quantum AI learning resources.</footer>
    </section>
  )
}

export default ConceptLibrary