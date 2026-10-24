import { ArrowRight, ArrowUpRight, BookOpen, Clock3, Target } from "lucide-react";
import type { Settings } from "../lib/types";

export default function About({ settings, onNavigate }: { settings: Settings; onNavigate: (tab: "settings" | "study") => void }) {
  return <div className="about-page">
    <div className="page-heading"><div><div className="eyebrow">THE SCIENCE BEHIND YOUR PRACTICE</div><h1>关于 MemoDash<span className="orange">。</span></h1><p>了解每一次评分，如何变成下一次恰好的重逢。</p></div><span className="subtle-tag">FSRS-6</span></div>

    <section className="panel about-intro" aria-labelledby="about-fsrs-title">
      <div className="about-symbol" aria-hidden="true"><BookOpen size={29} strokeWidth={1.3}/></div>
      <div><span className="eyebrow">FREE SPACED REPETITION SCHEDULER</span><h2 id="about-fsrs-title">把复习，安排在记忆需要的时候</h2><p>FSRS 是一种开源的间隔重复调度算法。它根据你过去的评分和经过的时间，估计一个单词当前被想起的概率，再结合目标记忆保留率计算下一次复习时间。</p><p>熟悉的词可以隔久一些再见，容易忘的词则需要更早重温。每个单词都有自己的复习节奏。</p></div>
    </section>

    <section className="about-section" aria-labelledby="about-memory-title">
      <div className="section-heading"><div><h2 id="about-memory-title">三个量，描述一段记忆</h2><p>同一个单词，对不同的人可以有不同的记忆状态。</p></div></div>
      <div className="about-concepts">
        <article className="panel"><span className="about-letter">D</span><h3>难度 <small>Difficulty</small></h3><p>反映这张卡片的记忆难度，影响复习后稳定性提升的速度。它会随评分更新。</p></article>
        <article className="panel"><span className="about-letter">S</span><h3>稳定性 <small>Stability</small></h3><p>衡量记忆能维持多久。在 FSRS 中，指回忆概率从 100% 降至 90% 所需的天数。</p></article>
        <article className="panel"><span className="about-letter">R</span><h3>可提取性 <small>Retrievability</small></h3><p>估计此刻能成功想起答案的概率。它与稳定性及距上次复习的时间有关，会随时间下降。</p></article>
      </div>
      <p className="about-reference">概念说明参考 <a href="https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS" target="_blank" rel="noreferrer">FSRS 官方入门文档 <ArrowUpRight size={12}/></a>。</p>
    </section>

    <section className="panel about-section" aria-labelledby="about-process-title">
      <div className="section-heading"><div><h2 id="about-process-title">本站如何使用 FSRS</h2><p>从看到单词，到安排下一次复习。</p></div></div>
      <ol className="about-flow">
        {[{title:"先独立回忆",text:"普通卡片先看单词、回忆含义；已学卡片有可用题目时，也可能出现例句填空或四选一考题。"},{title:"给出真实评分",text:"揭晓答案后，用 1–4 选择忘记、困难、记得或轻松。评分时记录本次学习，并更新个人卡片状态。"},{title:"计算下次时间",text:"服务端结合当前卡片、评分、经过的时间和目标保留率，计算下一次到期时间。"},{title:"到期后再次相遇",text:"在每日额度内优先呈现到期卡片，再安排当前词书和生词本中尚未学过的词。"}].map((step,i)=><li key={step.title}><span>{String(i+1).padStart(2,"0")}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}
      </ol>
      <div className="about-inline-note"><Clock3 size={17}/><p>新词学习步骤设为 <b>1 分钟、10 分钟</b>；遗忘后的重学步骤为 <b>10 分钟</b>。实际进入哪个步骤、何时转为长期复习，取决于当前状态和评分。评分按钮上会显示本次预计间隔。</p></div>
    </section>

    <section className="panel about-section" aria-labelledby="about-ratings-title">
      <div className="section-heading"><div><h2 id="about-ratings-title">四个评分，怎么选</h2><p>按刚才回忆或答题的真实情况评分。</p></div></div>
      <div className="about-ratings">
        {[{name:"忘记",en:"Again",meaning:"没有想起来，或回忆错误。",effect:"重新巩固，通常较快再次出现。"},{name:"困难",en:"Hard",meaning:"想对了，但花了很大力气。",effect:"保守推进，安排较紧密的复习。"},{name:"记得",en:"Good",meaning:"正常、正确地回忆出了意思。",effect:"按当前记忆状态继续推进。"},{name:"轻松",en:"Easy",meaning:"很快、很有把握地想对了。",effect:"通常可以间隔更久再复习。"}].map((rating,i)=><article key={rating.en}><div><span className={`rating-tag tag-${i+1}`}>{rating.name}</span><kbd>{i+1}</kbd></div><h3>{rating.en}</h3><p>{rating.meaning}</p><small>{rating.effect}</small></article>)}
      </div>
      <p className="about-footnote">“困难”表示仍然答对了；没有想起来时应选择“忘记”。具体间隔由卡片状态计算，评分名称不对应固定天数。</p>
    </section>

    <section className="panel about-section" aria-labelledby="about-plan-title">
      <div className="section-heading"><div><h2 id="about-plan-title">你的目标，决定复习节奏</h2><p>这里显示你当前保存的学习设置。</p></div><button className="text-button" onClick={()=>onNavigate("settings")}>调整设置 <ArrowRight size={14}/></button></div>
      <div className="about-plan"><div className="about-target"><Target size={21}/><strong>{Math.round(settings.retention*100)}<span>%</span></strong><span>当前目标保留率</span></div><div><h3>在“记得住”和“复习量”之间找平衡</h3><p>本站默认目标为 90%，可调整范围为 70%–99%。目标越高，通常需要越频繁地复习。这个百分比是模型用于安排间隔的目标，不能保证每次回忆都达到相同结果。</p><p>更改目标后，会在之后评分、计算新到期时间时使用；已有卡片不会立即全部重新排期。</p></div></div>
      <dl className="about-settings"><div><dt>每日新词</dt><dd>{settings.newLimit} 个{settings.newLimit===0?" · 暂停新词":""}</dd></div><div><dt>每日复习</dt><dd>{settings.reviewLimit===0?"不限次数":`${settings.reviewLimit} 次`}</dd></div><div><dt>每日额度时区</dt><dd>{settings.timezone}</dd></div></dl>
      <p className="about-footnote">新词在第一次评分后计入当日额度，词书与生词本共享上限。单纯查看卡片或添加生词不占额度。已学卡片的后续每次评分计为一次复习；每日额度按所选时区的午夜重新统计。</p>
    </section>

    <section className="panel about-section" aria-labelledby="about-details-title">
      <div className="section-heading"><h2 id="about-details-title">一些值得了解的细节</h2></div>
      <div className="about-faq">
        <details><summary>为什么同一个单词，每个人的复习时间不同？</summary><p>本站使用固定的 FSRS-6 模型参数，但每个账号独立保存每张卡片的难度、稳定性、评分记录和到期时间。不同的评分和学习时间，会形成不同的卡片状态与复习安排。词书内容共享，学习进度各自独立。</p></details>
        <details><summary>概览中的“预计记忆保留率”是什么意思？</summary><p>这是对已有复习时间和稳定性的卡片，计算当前回忆概率后取平均得到的模型估计值。它会随时间和学习记录变化，与设置里的目标保留率含义不同。</p></details>
        <details><summary>刚学过的单词，为什么很快又出现？</summary><p>新词和遗忘后的卡片会经历短期学习步骤，用较短的间隔巩固记忆。进入长期复习后，间隔再由 FSRS 根据记忆状态计算。短期卡片还没到期时，队列可能暂时完成；到点后可以刷新队列继续。</p></details>
        <details><summary>本站采用哪一个算法实现？</summary><p>本站采用 <a href="https://github.com/open-spaced-repetition/ts-fsrs/tree/v5.2.3" target="_blank" rel="noreferrer">ts-fsrs 5.2.3</a> 的 FSRS-6 实现，使用固定的 21 个模型参数，关闭间隔随机扰动。每次评分由服务端更新卡片并保存复习记录，登录同一账号即可在不同设备上继续学习。</p></details>
      </div>
    </section>

    <div className="about-closing"><div><h2>了解原理，也别忘了今天的练习。</h2><p>先回忆，诚实评分，按自己的节奏持续积累。</p></div><button className="button primary" onClick={()=>onNavigate("study")}>开始学习 <ArrowRight size={16}/></button></div>
  </div>;
}
