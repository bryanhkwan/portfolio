import { useEffect, useRef, useState } from 'react';
import CourtReplay from './CourtReplay';
import { projects } from '../data/projects';
import { arenaChapters, type ChapterId } from '../data/arena-chapters';
import { href, email, articleUrl } from '../lib/paths';
import '../styles/arena-display.css';

const featured = projects.filter(project => project.case);
const projectNames = ['CourtVision', 'Basketball', 'Astros', 'Volleyball'];
const researchSections = ['Question', 'Approach', 'Findings', 'Limitations'] as const;
const storySections = ['Toledo roots', 'Education', 'How I work'] as const;
const Arrow = () => <span aria-hidden="true">↗</span>;
const resume = href('BryanKwan_Updated_Resume.pdf');

const projectDetails: Record<string, { contribution: string; question: string; evidence: string; boundary: string }> = {
  'computer-vision': {
    contribution: 'The Python vision pipeline, React coaching interface, interactive 3D replay, and scoped public demo alongside the private coaching workspace.',
    question: 'How can a coach move from the source film to a useful teaching moment without losing context?',
    evidence: 'Try the March 12 Toledo–Bowling Green match: source film, player profiles, shot maps, and 69 partial replay windows. No account is required.',
    boundary: 'Movement is reconstructed from film, with coverage that varies by play. Match statistics come from separate reviewed event and official match records; reconstructed movement alone does not establish shot ownership or results.',
  },
  basketball: {
    contribution: 'Scouting interfaces, configurable evaluation tools, roster scenarios, and analytical workflows within Toledo Athletics’ data internship program.',
    question: 'Who fits the job this team needs done, within the constraints this roster actually has?',
    evidence: 'A working dashboard connects role-specific evaluation, spatial shot analysis, and a roster builder with size, league, duplication, and budget constraints.',
    boundary: 'The saved tournament retrospective covers three games. It is a small validation case, not a broad claim of predictive accuracy.',
  },
  astros: {
    contribution: 'Python data preparation, validated survey/game joins, operational-driver comparisons, logistic regression, and an executive presentation.',
    question: 'Which part of the fan experience is the strongest candidate for a repeat-purchase experiment?',
    evidence: 'Among 1,800 supplied surveys, higher concessions ratings were associated with a 28.0% repurchase rate, compared with 20.3% for lower ratings.',
    boundary: 'This was an analyst exercise using supplied case data. The relationship is observational; it is not an achieved sales increase or an Astros client engagement.',
  },
  volleyball: {
    contribution: 'Data ingestion, local session storage, analytical comparisons, and interactive dashboard workflows.',
    question: 'How do you compare practice performance when roles, attempt volumes, and session types are different?',
    evidence: 'A working browser workflow imports and merges sessions, applies sample guards, and connects player development with setter–hitter chemistry.',
    boundary: 'Small samples still need domain judgment. Team datasets remain separate from the portfolio; imported data stays in the dashboard’s local browser storage.',
  },
};

export default function ArenaChapter({ chapter, close }: { chapter: ChapterId; close(): void }) {
  const [projectId, setProjectId] = useState('computer-vision');
  const [employer, setEmployer] = useState<'toledo' | 'mbs'>('toledo');
  const [researchSection, setResearchSection] = useState<typeof researchSections[number]>('Question');
  const [storySection, setStorySection] = useState<typeof storySections[number]>('Toledo roots');
  const reading = useRef<HTMLDivElement>(null);
  const destination = arenaChapters.find(item => item.id === chapter)!;
  const project = featured.find(item => item.id === projectId)!;
  const detail = projectDetails[project.id];
  const isToledo = employer === 'toledo';

  useEffect(() => { if (reading.current) reading.current.scrollTop = 0; }, [chapter, projectId, employer, researchSection, storySection]);

  return <section className="arena-chapter arena-display-content" aria-labelledby="arena-chapter-title" data-chapter={chapter}>
    <header className="arena-chapter-top">
      <div className="arena-display-location"><span>{destination.number}</span><div><strong>{destination.location}</strong><span>{destination.title}</span></div></div>
      <button type="button" className="arena-display-close" onClick={close} aria-label="Close section and return to arena overview">Return to arena <span aria-hidden="true">×</span></button>
    </header>

    <div ref={reading} className="arena-reading-scroll" role="region" aria-label={`${destination.title} reading area`} tabIndex={0}>
      {chapter === 'experience' && <div className="arena-broadcast">
        <div className="arena-broadcast-tools">
          <div className="arena-display-eyebrow"><span>Bryan Kwan / Career record</span></div>
          <div className="arena-role-selector arena-display-selector" role="group" aria-label="Experience employer">
            <button type="button" aria-pressed={isToledo} onClick={() => setEmployer('toledo')}><span aria-hidden="true">01</span> Toledo Athletics</button>
            <button type="button" aria-pressed={!isToledo} onClick={() => setEmployer('mbs')}><span aria-hidden="true">02</span> Modern Builders Supply</button>
          </div>
        </div>
        <div className="arena-broadcast-title" key={employer}>
          <p className="arena-display-kicker">{isToledo ? 'Sports analytics' : 'Market & product analytics / 2024–2025'}</p>
          <h2 id="arena-chapter-title" tabIndex={-1}>{isToledo ? <>University of Toledo<span>Athletics.</span></> : <>Modern Builders<span>Supply.</span></>}</h2>
          <p className="arena-display-role">{isToledo ? 'Data Science & Sports Analytics Internship' : 'Market Analyst / E-Commerce Specialist'}</p>
        </div>
        <div className="arena-display-columns arena-experience-columns">
          <div>
            <h3 className="arena-display-label">The contribution</h3>
            <p className="arena-display-lede">{isToledo ? 'Making player evaluation and roster decisions easier to inspect, compare, and carry forward.' : 'Connecting pricing, marketplace, and competitor information to everyday commercial decisions.'}</p>
            <ul className="arena-contribution-list">
              {isToledo ? <>
                <li><strong>Make the comparison useful.</strong> Dashboards and configurable player evaluations put different dimensions of performance alongside one another.</li>
                <li><strong>Make the constraints visible.</strong> Roster scenarios connect a player shortlist to the practical limits of building a team.</li>
                <li><strong>Connect analysis to its audience.</strong> Analytical workflows were developed within the department’s data internship program.</li>
              </> : <>
                <li><strong>Understand the market.</strong> Pricing and competitor analysis supported commercial decisions.</li>
                <li><strong>Connect the data.</strong> SQL-driven workflows supported the analysis of business and marketplace information.</li>
                <li><strong>Keep the product context.</strong> E-commerce work linked marketplace questions with the decisions behind product presentation and pricing.</li>
              </>}
            </ul>
          </div>
          <aside className="arena-evidence-column" aria-label="Experience evidence">
            <h3 className="arena-display-label">Follow the evidence</h3>
            {isToledo ? <>
              <a className="arena-evidence-link" href={href('work/basketball/')}><span>Related work<strong>Basketball decision platform</strong></span><Arrow /></a>
              <p>Explore the scouting workflow, roster constraints, saved validation, and the limits of the analysis.</p>
              <a className="arena-evidence-link" href={articleUrl} target="_blank" rel="noopener"><span>Independent context<strong>Toledo Athletics feature</strong></span><Arrow /></a>
              <p>The department’s published feature names me among the students working on the basketball project.</p>
            </> : <>
              <a className="arena-evidence-link" href={href('recommendation.pdf')} target="_blank" rel="noopener"><span>Professional reference<strong>Recommendation letter</strong></span><Arrow /></a>
              <p>Read the professional recommendation alongside the experience and qualifications in my résumé.</p>
              <a className="arena-evidence-link" href={resume} target="_blank" rel="noopener"><span>Full background<strong>Experience & qualifications</strong></span><Arrow /></a>
            </>}
          </aside>
        </div>
      </div>}

      {chapter === 'projects' && <div className="arena-project-workspace">
        <div className="arena-display-eyebrow"><span>Center court / Selected work</span><span>Build. Inspect. Improve.</span></div>
        <div className="arena-project-selector arena-display-selector" role="group" aria-label="Featured projects">
          {featured.map((item, index) => <button type="button" key={item.id} aria-pressed={projectId === item.id} onClick={() => setProjectId(item.id)}>{projectNames[index]}</button>)}
        </div>
        <div className="arena-project-detail" key={project.id}>
          <div className={`arena-display-columns arena-project-columns ${project.id === 'computer-vision' ? 'has-replay' : ''}`}>
            <div className="arena-project-copy">
              <p className="arena-display-kicker">{project.category === 'Vision' ? 'Computer vision / Product engineering' : `${project.category} / Analytics`}</p>
              <h2 id="arena-chapter-title" tabIndex={-1}>{project.title}<span className="gold">.</span></h2>
              <p className="arena-display-lede">{project.description}</p>
              <a className="arena-primary-link" href={href(`work/${project.case}/`)}>Explore {project.id === 'computer-vision' ? 'CourtVision' : 'the case study'} <Arrow /></a>
              <h3 className="arena-display-label">My contribution</h3>
              <p>{detail.contribution}</p>
              <div className="arena-stack" aria-label="Project technologies">{project.stack.map(tool => <span key={tool}>{tool}</span>)}</div>
            </div>
            {project.id === 'computer-vision' ? <div className="arena-project-demonstration"><CourtReplay compact /></div> : <div className="arena-project-evidence">
              <p className="arena-display-kicker">The question</p><h3>{detail.question}</h3>
              {project.id === 'astros' ? <figure className="arena-survey-figure">
                <figcaption>Observed repeat-purchase rate by average concessions rating</figcaption>
                <div><span>Rating ≥ 4</span><strong>28.0%</strong><i style={{ width: '93.3%' }} /></div>
                <div><span>Rating &lt; 4</span><strong>20.3%</strong><i style={{ width: '67.7%' }} /></div>
                <p>Association in supplied case data. No causal effect established.</p>
              </figure> : <ol className="arena-workflow-list">
                {(project.id === 'basketball' ? [['01', 'Compare players', 'Role-specific evaluation and spatial shot context.'], ['02', 'Inspect tradeoffs', 'Configurable priorities and visible assumptions.'], ['03', 'Construct a roster', 'Size, league, duplication, and budget constraints.']] : [['01', 'Import & merge', 'Bring CSV and spreadsheet sessions into one workflow.'], ['02', 'Compare in context', 'Account for roles, attempt volumes, and sample size.'], ['03', 'Explore chemistry', 'Connect setter–hitter pairings and development.']]).map(([number, title, copy]) => <li key={number}><span>{number}</span><div><strong>{title}</strong><p>{copy}</p></div></li>)}
              </ol>}
            </div>}
          </div>
          <div className="arena-project-proof"><div><h3 className="arena-display-label">What is working</h3><p>{detail.evidence}</p></div><div><h3 className="arena-display-label">Keep the context</h3><p>{detail.boundary}</p></div></div>
          <div className="arena-display-links">
            {project.demo && <a className="arena-secondary-link" href={project.demo} target="_blank" rel="noopener">{project.id === 'computer-vision' ? 'Try live demo' : 'Open dashboard'} <Arrow /></a>}
            {project.source && <a className="arena-secondary-link" href={project.source} target="_blank" rel="noopener">View source <Arrow /></a>}
            <a className="arena-secondary-link" href={href('work/')}>All projects <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </div>}

      {chapter === 'research' && <div className="arena-film-room">
        <div className="arena-display-eyebrow"><span>Independent research</span><span>Manuscript / July 2026</span></div>
        <div className="arena-research-selector arena-display-selector" role="group" aria-label="Research chapters">
          {researchSections.map((section, index) => <button type="button" key={section} aria-pressed={section === researchSection} onClick={() => setResearchSection(section)}><span aria-hidden="true">0{index + 1}</span>{section}</button>)}
        </div>
        <p className="arena-display-kicker">How Development Environments Shape Athletic Greatness</p>
        <h2 id="arena-chapter-title" tabIndex={-1}>{researchSection === 'Question' ? <>Talent is global.<span>Opportunity is local.</span></> : researchSection === 'Approach' ? 'Build the comparison carefully.' : researchSection === 'Findings' ? 'One snapshot of representation.' : 'A proxy is not the whole story.'}</h2>
        {researchSection === 'Question' && <div className="arena-display-columns arena-research-columns">
          <div><p className="arena-display-lede">Why do some development environments produce a disproportionate share of elite athletes?</p><p>This exploratory study asks how country-level patterns of athlete representation relate to economic conditions, population, and development environments.</p><p>I built a reproducible comparison and made the measurement choices visible, so the results can lead to more specific questions about opportunity.</p></div>
          <figure className="arena-opportunity-figure"><div><span>01 / Context</span><strong>Environment</strong><p>Economic conditions, population, and development indicators.</p></div><span aria-hidden="true">↓</span><div><span>02 / Question</span><strong>Opportunity</strong><p>What might the setting make possible?</p></div><span aria-hidden="true">↓</span><div><span>03 / Observation</span><strong>Representation</strong><p>Public player and roster records.</p></div><figcaption>Conceptual research framework. The arrows do not establish causation.</figcaption></figure>
        </div>}
        {researchSection === 'Approach' && <>
          <p className="arena-display-lede">Public sources. Validated country mappings. Country-level comparisons and exploratory regressions.</p>
          <div className="arena-research-metrics"><div><strong>217</strong><span>Countries / territories in the validation report</span></div><div><strong>19,153</strong><span>Active 2025 football-player rows</span></div><div><strong>135</strong><span>International NBA roster rows</span></div></div>
          <p className="arena-display-note">Saved project validation figures. These measures describe different source populations.</p>
          <div className="arena-display-columns"><div><h3>Assemble and reconcile.</h3><p>Combine World Bank development indicators, HDI, active Transfermarkt records, the NBA’s international opening-night roster, and a historical FIFA ranking snapshot.</p></div><div><h3>Keep definitions attached.</h3><p>Validate country mappings before comparison. Document that the sources describe different dates and definitions of athlete representation.</p></div></div>
        </>}
        {researchSection === 'Findings' && <>
          <p className="arena-display-lede">International players on 2025–26 NBA opening-night rosters, grouped using the NBA’s country classifications.</p>
          <figure className="arena-research-chart"><img src={href('media/nba-players-by-country.png')} width="1620" height="1260" loading="lazy" alt="Country-level distribution of international players on 2025–26 NBA opening-night rosters." /><figcaption>Roster representation is the measure here. This figure does not identify where an athlete was born or trained.</figcaption></figure>
          <p>The manuscript originally describes this sample as excluding U.S.-born players. The NBA’s published international-player classifications can include U.S.-born players; use that classification when interpreting this figure.</p>
          <a className="arena-secondary-link" href="https://pr.nba.com/international-players-2025-26-nba-rosters/" target="_blank" rel="noopener">Read the NBA source definition <Arrow /></a>
        </>}
        {researchSection === 'Limitations' && <div className="arena-display-columns arena-research-columns">
          <div><p className="arena-display-lede">The relationships are correlational. They should prompt better questions about systems and opportunity.</p><p>This is an independent exploratory manuscript, not a peer-reviewed publication. It does not establish that a country’s development indicators cause an athlete’s success.</p></div>
          <ol className="arena-limitations-list"><li><strong>Citizenship is not a training history.</strong><p>Country classifications can differ from birthplace and the environment where an athlete developed.</p></li><li><strong>Representation is an imperfect proxy.</strong><p>Market values, roster membership, and national-team rankings measure different things.</p></li><li><strong>Coverage changes the comparison.</strong><p>Source dates, small-country denominators, and incomplete records affect the interpretation.</p></li></ol>
        </div>}
        <a className="arena-primary-link" href={href('research/')}>Read the full research <Arrow /></a>
      </div>}

      {chapter === 'about' && <div className="arena-story-wall">
        <div className="arena-display-eyebrow"><span>The person behind the work</span><span>Bryan Kwan / Toledo, Ohio</span></div>
        <div className="arena-story-selector arena-display-selector" role="group" aria-label="About chapters">
          {storySections.map(section => <button type="button" key={section} aria-pressed={section === storySection} onClick={() => setStorySection(section)}>{section}</button>)}
        </div>
        <div className="arena-display-columns arena-story-columns">
          <div><p className="arena-display-kicker">{storySection === 'Toledo roots' ? 'Home court / A sense of place' : storySection === 'Education' ? 'Education / A connected perspective' : 'Practice / From question to product'}</p>
            <h2 id="arena-chapter-title" tabIndex={-1}>{storySection === 'Toledo roots' ? <>Rooted in Toledo.<span>Always curious.</span></> : storySection === 'Education' ? <>Business questions.<span>Analytical tools.</span></> : <>An analyst<span>who likes to build.</span></>}</h2>
            {storySection === 'Toledo roots' ? <><p className="arena-display-lede">I’m Bryan. I work across sports analytics, business intelligence, and product development.</p><p>I’m interested in the entire path from a messy dataset to a useful decision: finding the question, shaping the data, and making the answer understandable.</p><p>This arena began with a photograph I took inside Savage Arena. It felt like a fitting home for work that brings sports, analysis, and building together.</p></> : storySection === 'Education' ? <><p className="arena-display-lede">University of Toledo</p><h3>Business Analytics</h3><p>Graduate study in Business Analytics, with a marketing concentration.</p><h3>Marketing & Professional Sales</h3><p>An undergraduate background in Marketing and Professional Sales brings the audience and the business question into the analytical work.</p><p>My résumé contains the full qualifications, dates, and experience.</p></> : <><p className="arena-display-lede">Get close to the question. Then build something useful around the answer.</p><p>A coach comparing players. A team understanding a practice. An operator deciding what to test next. I like work where an analytical result has to meet a practical constraint.</p><p>I think about the model and the interface together. The result should be understandable, its assumptions should be visible, and the next step should be clear.</p></>}
          </div>
          <aside className="arena-story-exhibit" aria-label={storySection === 'Toledo roots' ? 'Home Court portfolio inspiration' : storySection === 'Education' ? 'Areas of practice' : 'Analytical product workflow'}>
            {storySection === 'Toledo roots' ? <><span className="arena-display-kicker">A familiar place.<br />Another perspective.</span><div className="arena-story-monogram" aria-hidden="true">UT<span>HOME COURT</span></div><p>Savage Arena is the setting. The projects are the reason to explore.</p></> : storySection === 'Education' ? <><span className="arena-display-kicker">The toolkit</span><dl><div><dt>Analysis</dt><dd>Regression, forecasting, optimization, and evaluation.</dd></div><div><dt>Data</dt><dd>Python, SQL, JavaScript, TypeScript, and R.</dd></div><div><dt>Communication</dt><dd>Power BI, Tableau, Excel, and interactive reporting.</dd></div></dl></> : <><span className="arena-display-kicker">How the work connects</span><ol className="arena-workflow-list"><li><span>01</span><div><strong>Find the decision.</strong><p>Understand who needs the answer and what they can act on.</p></div></li><li><span>02</span><div><strong>Inspect the evidence.</strong><p>Keep definitions, assumptions, and limitations visible.</p></div></li><li><span>03</span><div><strong>Build the next step.</strong><p>Make the analysis usable in a real workflow.</p></div></li></ol></>}
          </aside>
        </div>
        <a className="arena-primary-link" href={href('about/')}>More about me <Arrow /></a>
      </div>}

      {chapter === 'contact' && <div className="arena-welcome-desk">
        <div className="arena-display-eyebrow"><span>The next conversation</span><span>Sports / Data / Product</span></div>
        <div className="arena-display-columns arena-contact-columns">
          <div><p className="arena-display-kicker">You’ve seen the work.</p><h2 id="arena-chapter-title" tabIndex={-1}>Let’s build<span>the next chapter.</span></h2><p className="arena-display-lede">I’m interested in sports analytics and data/product roles where the work helps someone make a better decision.</p><p>Have a project question or an opportunity in mind? I’d be happy to talk through the thinking, the build, and what comes next.</p><a className="arena-contact-email" href={`mailto:${email}`}><span>Email Bryan<strong>{email}</strong></span><Arrow /></a></div>
          <div className="arena-contact-actions"><a className="arena-resume-ticket" href={resume} target="_blank" rel="noopener"><span>Background & qualifications</span><strong>View my<br />résumé.</strong><span>Open PDF <Arrow /></span></a><div className="arena-contact-links"><a href="https://www.linkedin.com/in/bryanhkwan/" target="_blank" rel="noopener"><span>Connect on<strong>LinkedIn</strong></span><Arrow /></a><a href="https://github.com/bryanhkwan" target="_blank" rel="noopener"><span>Explore the code<strong>GitHub</strong></span><Arrow /></a></div></div>
        </div>
      </div>}
    </div>

    <footer className="arena-display-footer">
      <span>{chapter === 'experience' ? isToledo ? 'Toledo Athletics / Sports analytics' : 'Modern Builders Supply / 2024–2025' : chapter === 'projects' ? `${project.title} / ${project.status}` : chapter === 'research' ? 'Independent exploratory manuscript' : chapter === 'about' ? 'An analyst who likes to build.' : 'Thanks for visiting Home Court.'}</span>
      <a href={chapter === 'research' ? href('talent-environment-research.pdf') : resume} target="_blank" rel="noopener">{chapter === 'research' ? 'Manuscript (PDF)' : 'Résumé (PDF)'} <Arrow /></a>
    </footer>
  </section>;
}
