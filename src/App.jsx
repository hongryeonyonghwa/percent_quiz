import { useEffect, useRef, useState } from "react";
import { QUESTIONS } from "./questions.js";
import { PHOTOS } from "./photos.js";

const ROUND_OPTIONS = [5, 10, 20, QUESTIONS.length]; // 마지막은 문제 은행 전체
const DEFAULT_ROUND = 20;
const MAX_SCORE = 1; // 맞히면 1점, 틀리면 0점. 그래서 점수 = 맞힌 개수
const CHOICE_COUNT = 4;
const MIN_GAP = 7; // 보기끼리 최소 이만큼(%p)은 떨어지게 해서 헷갈리지 않게 한다

const pct = (n) => `${n.toFixed(1)}%`;
const TIER_LABEL = { correct: "정답!", wrong: "오답!" };
const tierOf = (correct) => (correct ? "correct" : "wrong");

// 튜토리얼 연습 문제. 실제 문제를 미리 보여 주지 않도록 문제 은행에 없는 통계를 쓴다.
const TOUR = {
  question: "지난 1년 동안 국내 여행을 다녀온 사람은 몇 %일까?",
  answer: 70.2,
  source: "국가데이터처 「2025년 사회조사」 (13세 이상)",
};
const TOUR_STEPS = 4;
const photoUrl = (id) => `${import.meta.env.BASE_URL}photos/${id}.webp`;
const GLITTER_COLORS = ["#f5c542", "#ff5fa2", "#3fd0ff", "#9b6bff", "#3ddc84", "#ff8a3d"];
const GLITTER_SHAPES = ["dot", "diamond", "strip", "star"];
const GLITTER_COUNT = 48;

// 정답 하나와 그럴듯한 오답 셋을 만들어 작은 수부터 늘어놓는다.
// 찍기로 맞히지 못하게 정답이 몇 번째 보기가 될지를 먼저 고르게 뽑고, 그만큼 오답을 정답 아래·위에 나눠 둔다.
// 오답은 정답에서 8%p 이상, 서로 MIN_GAP 이상 떨어지게 하고 0.5~99.5% 안에 둔다.
function makeChoices(answer) {
  const LOW = 0.5;
  const HIGH = 99.5;
  const NEAREST = 8; // 정답과 가장 가까운 오답까지의 거리
  const GAP = MIN_GAP + 0.1; // 소수 첫째 자리 반올림으로 간격이 줄어드는 몫
  const SPREAD = 25; // 오답이 퍼질 수 있는 여유. 너무 멀면 티가 나서 이 정도로 묶는다
  const fits = (space) => (space >= NEAREST ? Math.floor((space - NEAREST) / GAP) + 1 : 0);
  const room = (dir) => (dir < 0 ? answer - LOW : HIGH - answer);

  const belowMax = Math.min(CHOICE_COUNT - 1, fits(room(-1)));
  const aboveMax = Math.min(CHOICE_COUNT - 1, fits(room(+1)));
  const minBelow = Math.max(0, CHOICE_COUNT - 1 - aboveMax);
  const below = minBelow + Math.floor(Math.random() * (belowMax - minBelow + 1));

  // 한쪽에 n개: 간격을 먼저 확보하고 남는 여유 안에서 무작위로 흩뿌린다. 자리가 모자라 실패하는 일이 없다.
  const side = (dir, n) => {
    if (n === 0) return [];
    const needed = NEAREST + (n - 1) * GAP;
    const slack = Math.min(room(dir), needed + SPREAD) - needed;
    return Array.from({ length: n }, () => Math.random() * slack)
      .sort((a, b) => a - b)
      .map((u, i) => {
        const value = Math.round((answer + dir * (NEAREST + u + i * GAP)) * 10) / 10;
        return Math.min(HIGH, Math.max(LOW, value));
      });
  };

  return [answer, ...side(-1, below), ...side(+1, CHOICE_COUNT - 1 - below)].sort((a, b) => a - b);
}

function newDeck(round) {
  const deck = [...QUESTIONS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, round).map((q) => ({ ...q, choices: makeChoices(q.answer) }));
}

// 결과 칭호. 정답률이 min 이상인 첫 줄을 쓴다. 4지선다는 찍기만 해도 25% 안팎이라 맨 아래를 30%로 잡았다.
const TITLES = [
  { min: 1, emoji: "👑", name: "통계청장급", line: "한 문제도 안 틀렸어요. 국가통계를 외우고 다니나요?" },
  { min: 0.9, emoji: "📊", name: "통계청 직원급", line: "숫자를 보는 눈이 남달라요." },
  { min: 0.7, emoji: "📰", name: "뉴스 좀 보는 사람", line: "세상 돌아가는 걸 꽤 알고 있어요." },
  { min: 0.5, emoji: "🙂", name: "평범한 대한민국 시민", line: "딱 평균, 감이 나쁘지 않아요." },
  { min: 0.3, emoji: "🎲", name: "감으로 사는 사람", line: "찍은 것치고는 선방했어요." },
  { min: 0, emoji: "🙈", name: "통계와 담 쌓은 사람", line: "다음엔 뉴스를 한 번 켜 볼까요?" },
];
const titleOf = (rate) => TITLES.find((t) => rate >= t.min);

export default function App() {
  const [round, setRound] = useState(DEFAULT_ROUND);
  const [phase, setPhase] = useState("intro"); // intro → quiz → summary
  const [toured, setToured] = useState(false); // 한 번 시작한 뒤에는 튜토리얼을 건너뛴다
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]);

  const current = deck[index];
  const result = results[index] ?? null;
  const total = results.reduce((sum, r) => sum + r.score, 0);

  // 화면이 바뀌면 맨 위부터 보여 준다. 버튼 autoFocus가 페이지를 아래로 내려 버리기 때문.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  // 다음 문제 사진을 미리 받아 둬서 넘어갈 때 배경이 바로 뜨게 한다.
  useEffect(() => {
    const upcoming = deck[index + 1];
    if (upcoming && PHOTOS[upcoming.id]) new Image().src = photoUrl(upcoming.id);
  }, [deck, index]);

  function pick(choice) {
    if (result) return;
    const correct = choice === current.answer;
    setResults([...results, { ...current, guess: choice, correct, score: correct ? MAX_SCORE : 0 }]);
  }

  function start(count) {
    setToured(true);
    setRound(count);
    setDeck(newDeck(count));
    setIndex(0);
    setResults([]);
    setPhase("quiz");
  }

  function next() {
    if (index + 1 < deck.length) {
      setIndex(index + 1);
    } else {
      setPhase("summary");
    }
  }

  return (
    <main className="page">
      <header className="top">
        <h1 className="brand">몇 %일까?</h1>
        {phase !== "intro" && (
          <p className="progress">
            {phase === "summary" ? "결과" : `${index + 1} / ${deck.length}`} · <b>{total}점</b>
          </p>
        )}
      </header>

      {phase === "intro" && <Intro round={round} skipTour={toured} onStart={start} />}

      {phase === "summary" && (
        <Summary results={results} total={total} onRestart={() => setPhase("intro")} />
      )}

      {phase === "quiz" && (
        <section className="card" key={current.id}>
          <QuestionHero question={current} />
          <Choices
            choices={current.choices}
            answer={current.answer}
            picked={result?.guess ?? null}
            onPick={pick}
          />
          {result && <Reveal result={result} isLast={index + 1 === deck.length} onNext={next} />}
        </section>
      )}
    </main>
  );
}

// 문제 머리: 사진을 배경으로 깔고 그 위에 질문을 흰 글씨로 올린다. 사진이 없는 문제는 질문만 보인다.
function QuestionHero({ question }) {
  const photo = PHOTOS[question.id];
  if (!photo) return <h2 className="question">{question.question}</h2>;

  return (
    <div className="question-hero">
      <img src={photoUrl(question.id)} alt="" style={{ objectPosition: photo.focus }} />
      <h2 className="question">{question.question}</h2>
      <a className="photo-credit" href={photo.link} target="_blank" rel="noopener noreferrer">
        사진 {photo.by} · {photo.license}
      </a>
    </div>
  );
}

// 보기 4개. 고르기 전에는 누를 수 있고, 고른 뒤에는 정답을 초록, 내가 고른 오답을 빨강으로 칠한다.
function Choices({ choices, answer, picked, onPick }) {
  const revealed = picked !== null;

  // 고르기 전에는 키보드 숫자 1~4로도 고를 수 있다.
  useEffect(() => {
    if (revealed) return;
    const onKey = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) onPick(choices[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="choices" role="group" aria-label="보기">
      {choices.map((c, i) => {
        const isAnswer = c === answer;
        const isPicked = c === picked;
        const state = !revealed ? "" : isAnswer ? " is-answer" : isPicked ? " is-picked" : " is-dim";
        return (
          <button
            key={c}
            type="button"
            className={`choice${state}`}
            disabled={revealed}
            onClick={() => onPick(c)}
          >
            <span className="choice-key" aria-hidden="true">
              {i + 1}
            </span>
            <span className="choice-value">
              {c.toFixed(1)}
              <small>%</small>
            </span>
            {revealed && isAnswer && <span className="choice-tag">정답</span>}
            {revealed && isPicked && !isAnswer && <span className="choice-tag">내 답</span>}
            {revealed && isAnswer && isPicked && <Glitter />}
          </button>
        );
      })}
    </div>
  );
}

// 첫 화면: 네 단계로 하나씩 보여 주는 튜토리얼.
// 소개 → 연습 문제로 직접 골라 보기 → 채점 보기 → 문제 수 고르기. 한 번 본 뒤에는 마지막 단계부터 연다.
function Intro({ round, skipTour, onStart }) {
  const [step, setStep] = useState(skipTour ? TOUR_STEPS - 1 : 0);
  const [tourChoices] = useState(() => makeChoices(TOUR.answer));
  const [practice, setPractice] = useState(null);
  const [count, setCount] = useState(round);
  const tier = tierOf(practice === TOUR.answer);
  const next = () => setStep(step + 1);

  return (
    <section className="card intro" key={step}>
      <ol className="steps" aria-label={`${TOUR_STEPS}단계 중 ${step + 1}단계`}>
        {Array.from({ length: TOUR_STEPS }, (_, i) => (
          <li key={i} className={i === step ? "is-now" : i < step ? "is-done" : ""} />
        ))}
      </ol>

      {step === 0 && (
        <>
          <h2 className="question">이 통계, 몇 %인지 감이 오나요?</h2>
          <p className="lead">
            한국 사회를 보여 주는 공식 통계 {QUESTIONS.length}개를 보기 4개 중에서 맞혀 보는
            퀴즈예요. 하는 법을 하나씩 보여 드릴게요.
          </p>
          <div className="actions">
            <button type="button" className="primary" onClick={next} autoFocus>
              어떻게 하는지 볼래요
            </button>
            <button type="button" className="secondary" onClick={() => setStep(TOUR_STEPS - 1)}>
              건너뛰기
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <p className="step-label">연습 · 보기 4개 중 하나를 골라요</p>
          <h2 className="question">{TOUR.question}</h2>
          <Choices
            choices={tourChoices}
            answer={TOUR.answer}
            picked={null}
            onPick={(c) => {
              setPractice(c);
              next();
            }}
          />
          <p className="lead">정답이라고 생각하는 보기를 눌러 보세요. 키보드 숫자 1~4로도 고를 수 있어요.</p>
        </>
      )}

      {step === 2 && (
        <>
          <p className="step-label">채점 · 맞히면 {MAX_SCORE}점</p>
          <h2 className="question">{TOUR.question}</h2>
          <Choices choices={tourChoices} answer={TOUR.answer} picked={practice} onPick={() => {}} />
          <ul className="tier-list">
            <TierRow tier="correct" mine={tier}>
              맞히면 {MAX_SCORE}점, 반짝이가 터져요
            </TierRow>
            <TierRow tier="wrong" mine={tier}>
              틀리면 0점, 정답이 초록색으로 보여요
            </TierRow>
          </ul>
          <p className="source">출처: {TOUR.source}</p>
          <button type="button" className="primary" onClick={next} autoFocus>
            알겠어요
          </button>
          <ResultBanner tier={tier} />
        </>
      )}

      {step === 3 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onStart(count);
          }}
        >
          <p className="step-label">준비 끝</p>
          <h2 className="question">몇 문제 풀어 볼까요?</h2>
          <fieldset className="count-picker">
            <legend className="sr-only">문제 수</legend>
            <div className="count-options">
              {ROUND_OPTIONS.map((n) => (
                <label key={n} className="count-option">
                  <input
                    type="radio"
                    name="count"
                    value={n}
                    checked={count === n}
                    onChange={() => setCount(n)}
                  />
                  <span>{n === QUESTIONS.length ? `전체 ${n}문제` : `${n}문제`}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="actions">
            <button type="submit" className="primary" autoFocus>
              시작!
            </button>
            <button type="button" className="secondary" onClick={() => setStep(0)}>
              튜토리얼 다시 보기
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// 튜토리얼 채점 단계의 한 줄. 연습 문제에서 내가 받은 결과에 표시를 한다.
function TierRow({ tier, mine, children }) {
  return (
    <li className={tier === mine ? "is-mine" : ""}>
      <span className={`chip is-${tier}`}>{TIER_LABEL[tier]}</span>
      <span>{children}</span>
      {tier === mine && <em>내 결과</em>}
    </li>
  );
}

// 채점 결과를 화면 한가운데에 크게 띄웠다가 지운다. 클릭은 아래로 통과한다.
function ResultBanner({ tier }) {
  return (
    <p className={`result-banner is-${tier}`} aria-hidden="true">
      {TIER_LABEL[tier]}
    </p>
  );
}

// 고른 뒤: 큰 정답·오답 글자를 띄우고, 출처와 다음 버튼을 보여 준다.
function Reveal({ result, isLast, onNext }) {
  const tier = tierOf(result.correct);
  const nextRef = useRef(null);

  useEffect(() => {
    nextRef.current.focus();
  }, []);

  return (
    <>
      <ResultBanner tier={tier} />
      <div className="after-reveal">
        {/* 보기 색과 큰 글자가 이미 알려 주므로 화면에는 쓰지 않고, 화면 읽기 프로그램에만 읽어 준다 */}
        <p className="sr-only" aria-live="polite">
          {result.correct ? "정답" : `오답, 내 답 ${pct(result.guess)}`}, 정답 {pct(result.answer)}
        </p>
        <p className="source">
          {result.note && (
            <>
              {result.note}
              <br />
            </>
          )}
          출처: {result.source}
        </p>
        <button type="button" className="primary" onClick={onNext} ref={nextRef}>
          {isLast ? "결과 보기" : "다음 문제"}
        </button>
      </div>
    </>
  );
}

// 정답일 때 보기 한가운데서 반짝이 가루가 사방으로 터진다. 조각마다 방향·거리·크기·색을 무작위로 정한다.
function Glitter() {
  const [bits] = useState(() =>
    Array.from({ length: GLITTER_COUNT }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 70 + Math.random() * 160;
      return {
        shape: GLITTER_SHAPES[i % GLITTER_SHAPES.length],
        style: {
          "--x": `${Math.cos(angle) * dist}px`,
          "--y": `${Math.sin(angle) * dist * 0.8 - 50}px`, // 위로 조금 더 솟게
          "--fall": `${60 + Math.random() * 90}px`,
          "--spin": `${(Math.random() - 0.5) * 900}deg`,
          "--size": `${5 + Math.random() * 7}px`,
          "--c": GLITTER_COLORS[i % GLITTER_COLORS.length],
          "--dur": `${900 + Math.random() * 700}ms`,
          "--delay": `${Math.random() * 120}ms`,
          "--twinkle": `${180 + Math.random() * 220}ms`,
        },
      };
    }),
  );

  return (
    <span className="glitter" aria-hidden="true">
      {bits.map((bit, i) => (
        <span key={i} className="glitter-bit" style={bit.style}>
          <i className={`is-${bit.shape}`} />
        </span>
      ))}
    </span>
  );
}

// 워들처럼 문제마다 칸 하나씩 칠하고, 10칸마다 줄을 바꾼다.
function blockRows(results) {
  const cells = results.map((r) => (r.correct ? "🟩" : "⬜"));
  const rows = [];
  for (let i = 0; i < cells.length; i += 10) rows.push(cells.slice(i, i + 10).join(""));
  return rows.join("\n");
}

const rateOf = (correctCount, n) => Math.round((correctCount / n) * 100);

// 카톡 등에 붙여 넣을 결과.
function shareText(results, total, title) {
  const lines = [
    `몇 %일까? 내 칭호는 ${title.emoji} ${title.name}`,
    `${total}점 / ${results.length * MAX_SCORE}점 · 정답률 ${rateOf(total, results.length)}%`,
    blockRows(results),
  ];
  if (location.protocol.startsWith("http")) lines.push(location.origin + location.pathname);
  return lines.join("\n");
}

function Summary({ results, total, onRestart }) {
  const correctCount = results.filter((r) => r.correct).length;
  const title = titleOf(correctCount / results.length);
  const [copied, setCopied] = useState(false);

  // 휴대폰에서는 공유 창(카톡 등)을 띄우고, 컴퓨터에서는 클립보드에 복사한다.
  async function share() {
    const text = shareText(results, total, title);
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ text });
      } catch {
        // 공유 창을 그냥 닫은 경우
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("아래 내용을 복사해서 공유하세요", text);
    }
  }

  return (
    <section className="card">
      <div className="title-card">
        <p className="title-label">내 칭호</p>
        <p className="title-name">
          <span aria-hidden="true">{title.emoji}</span> {title.name}
        </p>
        <p className="title-line">{title.line}</p>
      </div>
      <p className="readout">
        {total}
        <span className="unit"> / {results.length * MAX_SCORE}</span>
      </p>
      <p className="verdict">
        <span className="chip is-correct">정답률 {rateOf(correctCount, results.length)}%</span>
      </p>
      <div className="blocks">
        <p className="blocks-row" aria-hidden="true">
          {blockRows(results)}
        </p>
        <p className="blocks-legend">🟩 정답 · ⬜ 오답</p>
      </div>
      <ol className="recap">
        {results.map((r) => (
          <li key={r.id}>
            <span className="recap-q">{r.question}</span>
            <span className="recap-nums">
              내 답 {pct(r.guess)} · 정답 {pct(r.answer)}
            </span>
            <span className="recap-score">+{r.score}</span>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button type="button" className="primary" onClick={share} autoFocus>
          {copied ? "복사했어요!" : "결과 공유하기"}
        </button>
        <button type="button" className="secondary" onClick={onRestart}>
          다시 하기
        </button>
      </div>
    </section>
  );
}
