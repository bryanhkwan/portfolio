import { useState } from 'react';
import { projects } from '../data/projects';
import { arenaChapters, type ChapterId } from '../data/arena-chapters';
import { href, email, articleUrl } from '../lib/paths';

const featured = projects.filter(project => project.case);
export default function ArenaChapter({ chapter, close }: { chapter: ChapterId; close(): void }) {
  const [projectId, setProjectId] = useState('computer-vision');
  const destination = arenaChapters.find(item => item.id === chapter)!;
  const project = featured.find(item => item.id === projectId)!;
  return <section className="arena-chapter" aria-labelledby="arena-chapter-title" data-chapter={chapter}>
    <div className="arena-chapter-top"><span>{destination.number} / {destination.location}</span><button onClick={close} aria-label="Close section and return to arena overview">Close <span aria-hidden="true">×</span></button></div>
    <p className="arena-chapter-category">{destination.title}</p>
    <h2 id="arena-chapter-title" tabIndex={-1}>{destination.headline}</h2>
    {chapter === 'projects' && <>
      <div className="arena-project-selector" role="group" aria-label="Featured projects">
        {featured.map((item, index) => <button key={item.id} aria-pressed={projectId === item.id} onClick={() => setProjectId(item.id)}>{['CourtVision', 'Basketball', 'Astros', 'Volleyball'][index]}</button>)}
      </div>
      <div className="arena-project-detail" key={project.id}>
        <span className="arena-panel-kicker">{project.category === 'Vision' ? 'COMPUTER VISION / PRODUCT' : `${project.category.toUpperCase()} / ANALYTICS`}</span>
        <h3>{project.title}<span className="gold">.</span></h3>
        <p>{project.description}</p>
        <a className="arena-primary-link" href={href(`work/${project.case}/`)}>Explore {project.id === 'computer-vision' ? 'CourtVision' : 'the case study'} <span aria-hidden="true">↗</span></a>
        {project.id === 'computer-vision' && <div className="arena-capabilities"><span>01 / Source-synchronized replay</span><span>02 / Shot maps & player context</span><span>03 / Saved teaching moments</span></div>}
        <div className="arena-stack">{project.stack.map(tool => <span key={tool}>{tool}</span>)}</div>
        <p className="arena-panel-note">{project.id === 'computer-vision' ? 'Private coaching platform. The movement on court is an illustrative sample.' : project.status}</p>
      </div>
      <a className="arena-secondary-link" href={href('work/')}>All projects <span aria-hidden="true">→</span></a>
    </>}
    {chapter === 'experience' && <>
      <p>Useful analysis starts close to the people making the decision.</p>
      <ol className="arena-timeline">
        <li><span>SPORTS ANALYTICS</span><h3>University of Toledo Athletics</h3><p className="arena-role">Data Science & Sports Analytics Internship</p><p>Dashboards, player evaluation, roster scenarios, and analytical workflows within the department’s data internship program.</p><a href={articleUrl} target="_blank" rel="noopener">Toledo Athletics feature ↗</a></li>
        <li><span>2024–2025 / MARKET & PRODUCT</span><h3>Modern Builders Supply</h3><p className="arena-role">Market Analyst / E-Commerce Specialist</p><p>Pricing, marketplace, competitor, and SQL-driven workflows supporting commercial decisions.</p><a href={href('recommendation.pdf')} target="_blank" rel="noopener">Recommendation letter (PDF) ↗</a></li>
      </ol>
      <a className="arena-primary-link" href={href('BryanKwan_Updated_Resume.pdf')} target="_blank" rel="noopener">View résumé (PDF) <span aria-hidden="true">↗</span></a>
    </>}
    {chapter === 'research' && <>
      <p>Why do some development environments produce a disproportionate share of elite athletes?</p>
      <div className="arena-research-figure" aria-hidden="true"><span>ENVIRONMENT</span><i/><span>OPPORTUNITY</span><i/><span>DEVELOPMENT</span></div>
      <h3>Look beyond the individual.</h3><p>Independent exploratory research connecting athlete representation to the environments where development happens.</p>
      <div className="arena-capabilities"><span>The question / Where does opportunity begin?</span><span>The approach / Compare development contexts</span><span>The discipline / Make limitations visible</span></div>
      <a className="arena-primary-link" href={href('research/')}>Read the research <span aria-hidden="true">↗</span></a>
      <a className="arena-secondary-link" href={href('talent-environment-research.pdf')} target="_blank" rel="noopener">Open manuscript (PDF) ↗</a>
      <p className="arena-panel-note">Exploratory research using snapshot data. Methods and limitations accompany the findings.</p>
    </>}
    {chapter === 'about' && <>
      <p>I’m Bryan. I work across sports, business, and product development. I care about the whole process: finding the question, shaping the data, and making the answer useful.</p>
      <div className="arena-about-mark" aria-hidden="true"><span>UT</span><div>HOME COURT<br/><strong>Toledo, Ohio.</strong></div></div>
      <h3>An analyst who likes to build.</h3><p>A coach comparing players. A team understanding a practice. An operator deciding what to test next. Those are the kinds of questions that draw me in.</p>
      <p>Graduate study in Business Analytics, with a marketing concentration. An undergraduate background in Marketing and Professional Sales.</p>
      <a className="arena-primary-link" href={href('about/')}>More about me <span aria-hidden="true">↗</span></a>
      <p className="arena-panel-note">This arena began with a photograph I took at Savage Arena. A familiar place, seen from another angle.</p>
    </>}
    {chapter === 'contact' && <>
      <p>I’m interested in sports analytics and data/product roles where the work helps someone make a better decision.</p>
      <a className="arena-contact-email" href={`mailto:${email}`}>{email}<span aria-hidden="true">↗</span></a>
      <div className="arena-contact-links"><a href="https://www.linkedin.com/in/bryanhkwan/" target="_blank" rel="noopener">LinkedIn <span aria-hidden="true">↗</span></a><a href="https://github.com/bryanhkwan" target="_blank" rel="noopener">GitHub <span aria-hidden="true">↗</span></a><a href={href('BryanKwan_Updated_Resume.pdf')} target="_blank" rel="noopener">Résumé (PDF) <span aria-hidden="true">↗</span></a></div>
      <p className="arena-panel-note">Have a question about a project or an opportunity in mind? Let’s talk.</p>
    </>}
  </section>;
}
