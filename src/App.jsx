import { useEffect, useRef, useState } from "react";
import { QUESTIONS } from "./questions.js";
import { PHOTOS } from "./photos.js";

const ROUND_OPTIONS = [5, 10, 20, QUESTIONS.length]; // 마지막은 문제 은행 전체
const DEFAULT_ROUND = 20;
const START_GUESS = 50;
const CORRECT_RANGE = 5; // 오차가 이 안이면 정답으로 친다
const NEAR_RANGE = 15; // 공유 결과에서 노란 칸으로 칠하는 오차
const REVEAL_MS = 1000; // 정답 숫자가 굴러가는 시간

const MAX_SCORE = 10; // 문제당 만점

// 정답 범위 안이면 10점. 그 밖으로 1%p 벗어날 때마다 0.4점씩 깎아 반올림하고, 30%p 이상 틀리면 0점.
// 만점은 '정답!'일 때만 준다. 반올림으로 정답이 아닌데 10점이 되지 않게 9점에서 막는다.
const isCorrect = (error) => error <= CORRECT_RANGE;
const scoreFor = (error) =>
  isCorrect(error)
    ? MAX_SCORE
    : Math.min(MAX_SCORE - 1, Math.max(0, Math.round(MAX_SCORE - (error - CORRECT_RANGE) * 0.4)));
const pct = (n) => `${n.toFixed(1)}%`;
const block = (error) => (isCorrect(error) ? "🟩" : error <= NEAR_RANGE ? "🟨" : "⬜");
const photoUrl = (id) => `${import.meta.env.BASE_URL}photos/${id}.webp`;
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const GLITTER_COLORS = ["#f5c542", "#ff5fa2", "#3fd0ff", "#9b6bff", "#3ddc84", "#ff8a3d"];
const GLITTER_SHAPES = ["dot", "diamond", "strip", "star"];
const GLITTER_COUNT = 48;

function newDeck(round) {
  const deck = [...QUESTIONS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, round);
}

function verdict(avgError) {
  if (avgError <= 3) return "통계 전문가 수준이에요.";
  if (avgError <= 7) return "감이 꽤 좋은 편이에요.";
  if (avgError <= 12) return "평범한 한국인의 감각이에요.";
  return "통계와는 조금 먼 사이네요.";
}

// from에서 to까지 REVEAL_MS 동안 처음엔 빠르게, 끝에선 천천히 움직이는 값.
function useRoll(from, to) {
  const [value, setValue] = useState(() => (reduceMotion() ? to : from));

  useEffect(() => {
    if (reduceMotion()) return;
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / REVEAL_MS);
      setValue(t === 1 ? to : from + (to - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to]);

  return value;
}

export default function App() {
  const [round, setRound] = useState(DEFAULT_ROUND);
  const [phase, setPhase] = useState("intro"); // intro → quiz → summary
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [guess, setGuess] = useState(START_GUESS);
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

  function submit() {
    if (result) return;
    const error = Math.abs(guess - current.answer);
    setResults([...results, { ...current, guess, error, score: scoreFor(error) }]);
  }

  function start(count) {
    setRound(count);
    setDeck(newDeck(count));
    setIndex(0);
    setGuess(START_GUESS);
    setResults([]);
    setPhase("quiz");
  }

  function next() {
    if (index + 1 < deck.length) {
      setIndex(index + 1);
      setGuess(START_GUESS);
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

      {phase === "intro" && <Intro round={round} onStart={start} />}

      {phase === "summary" && (
        <Summary results={results} total={total} onRestart={() => setPhase("intro")} />
      )}

      {phase === "quiz" && (
        <section className="card" key={current.id}>
          <QuestionHero question={current} />

          {result ? (
            <Reveal result={result} isLast={index + 1 === deck.length} onNext={next} />
          ) : (
            <>
              <p className="readout" aria-hidden="true">
                {guess}
                <span className="unit">%</span>
              </p>
              <div className="scale">
                <input
                  id="guess"
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={guess}
                  autoFocus
                  aria-label={current.question}
                  aria-valuetext={`${guess}%`}
                  style={{ "--value": `${guess}%` }}
                  onChange={(e) => setGuess(Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    // 같은 Enter가 곧바로 나타나는 '다음 문제' 버튼까지 눌러 버리지 않게 막는다
                    e.preventDefault();
                    submit();
                  }}
                />
                <Ticks />
              </div>
              <button type="button" className="primary" onClick={submit}>
                정답 보기
              </button>
            </>
          )}
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

// 첫 화면: 하는 법을 보여 주고 문제 수를 고른다.
function Intro({ round, onStart }) {
  const [count, setCount] = useState(round);

  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(count);
      }}
    >
      <h2 className="question">이 통계, 몇 %인지 감이 오나요?</h2>

      <ol className="howto">
        <li>
          질문을 읽고 슬라이더로 몇 %일지 골라요.
          <span>5% 단위로 움직여요.</span>
        </li>
        <li>
          <b>정답 보기</b>를 누르면 실제 공식 통계가 공개돼요.
        </li>
        <li>
          정답과 ±{CORRECT_RANGE}%p 안이면 <b className="is-correct">정답!</b> {MAX_SCORE}점이에요.
          <span>예: 정답이 38.5%면 35%도 40%도 정답. 멀어질수록 점수가 깎여요.</span>
        </li>
      </ol>

      <fieldset className="count-picker">
        <legend>문제 수</legend>
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

      <button type="submit" className="primary" autoFocus>
        시작하기
      </button>
    </form>
  );
}

// 정답 공개: 큰 숫자와 정답 핀이 내 답에서 출발해 정답까지 굴러가고, 멈추면 채점 결과가 나타난다.
function Reveal({ result, isLast, onNext }) {
  const shown = useRoll(result.guess, result.answer);
  const done = shown === result.answer;
  const nextRef = useRef(null);

  useEffect(() => {
    if (done) nextRef.current.focus();
  }, [done]);

  return (
    <>
      <p className="readout is-answer">
        <span className="readout-num" aria-hidden="true">
          {shown.toFixed(1)}
          <span className="unit">%</span>
          {done && isCorrect(result.error) && <Glitter />}
        </span>
        <span className="sr-only" aria-live="polite">
          {done ? `정답 ${pct(result.answer)}` : ""}
        </span>
      </p>

      <div className="scale">
        <Ruler guess={result.guess} answer={result.answer} at={shown} />
        <Ticks />
      </div>

      <div className={`after-reveal${done ? " is-shown" : ""}`}>
        <p className="verdict">
          {isCorrect(result.error) && <span className="chip is-correct">정답!</span>}
          <span className="chip">내 답 {result.guess}%</span>
          오차 <b>{result.error.toFixed(1)}%p</b> · <b>+{result.score}점</b>
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

// 정답일 때 숫자 한가운데서 반짝이 가루가 사방으로 터진다. 조각마다 방향·거리·크기·색을 무작위로 정한다.
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
    <span className="glitter">
      {bits.map((bit, i) => (
        <span key={i} className="glitter-bit" style={bit.style}>
          <i className={`is-${bit.shape}`} />
        </span>
      ))}
    </span>
  );
}

function Ticks() {
  return (
    <div className="ticks" aria-hidden="true">
      {[0, 25, 50, 75, 100].map((t) => (
        <span key={t} style={{ left: `${t}%` }}>
          {t}
        </span>
      ))}
    </div>
  );
}

// 0~100 눈금 위에 내 답과 정답 핀을 찍고, 그 사이(오차)를 칠한다.
// 정답 핀은 at 위치에 그려서 공개할 때 움직일 수 있게 한다.
function Ruler({ guess, answer, at }) {
  const lo = Math.min(guess, at);
  const hi = Math.max(guess, at);
  const guessSide = guess <= answer ? "to-left" : "to-right";
  const answerSide = guess <= answer ? "to-right" : "to-left";

  return (
    <div className="ruler-track" role="img" aria-label={`내 답 ${guess}%, 정답 ${pct(answer)}`}>
      <span className="ruler-gap" style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
      <span className={`pin pin-guess ${guessSide}`} style={{ left: `${guess}%` }}>
        <em>내 답</em>
      </span>
      <span className={`pin pin-answer ${answerSide}`} style={{ left: `${at}%` }}>
        <em>정답</em>
      </span>
    </div>
  );
}

// 워들처럼 문제마다 칸 하나씩 칠하고, 10칸마다 줄을 바꾼다.
function blockRows(results) {
  const cells = results.map((r) => block(r.error));
  const rows = [];
  for (let i = 0; i < cells.length; i += 10) rows.push(cells.slice(i, i + 10).join(""));
  return rows.join("\n");
}

// 카톡 등에 붙여 넣을 결과.
function shareText(results, total, correctCount) {
  const lines = [`몇 %일까? ${total}점 · 정답 ${correctCount}/${results.length}`, blockRows(results)];
  if (location.protocol.startsWith("http")) lines.push(location.origin + location.pathname);
  return lines.join("\n");
}

function Summary({ results, total, onRestart }) {
  const avgError = results.reduce((sum, r) => sum + r.error, 0) / results.length;
  const correctCount = results.filter((r) => isCorrect(r.error)).length;
  const [copied, setCopied] = useState(false);

  // 휴대폰에서는 공유 창(카톡 등)을 띄우고, 컴퓨터에서는 클립보드에 복사한다.
  async function share() {
    const text = shareText(results, total, correctCount);
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
      <p className="readout">
        {total}
        <span className="unit"> / {results.length * MAX_SCORE}</span>
      </p>
      <p className="verdict">
        <span className="chip is-correct">
          정답 {correctCount} / {results.length}
        </span>
        평균 오차 <b>{avgError.toFixed(1)}%p</b> · {verdict(avgError)}
      </p>
      <div className="blocks">
        <p className="blocks-row" aria-hidden="true">
          {blockRows(results)}
        </p>
        <p className="blocks-legend">
          🟩 정답 (±{CORRECT_RANGE}%p) · 🟨 ±{NEAR_RANGE}%p 이내 · ⬜ 그 밖
        </p>
      </div>
      <ol className="recap">
        {results.map((r) => (
          <li key={r.id}>
            <span className="recap-q">{r.question}</span>
            <span className="recap-nums">
              내 답 {r.guess}% · 정답 {pct(r.answer)}
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
