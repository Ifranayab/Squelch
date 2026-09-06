const Groq = require('groq-sdk');

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// Plain-language description of each signal type, used only when telling the
// model (or the fallback text) that ANOTHER signal fired on the same stock
// at the same time. Deliberately not the raw signal_type string or the UI's
// badge label ("Volume anomaly") — this is prose, not a category name.
const PLAIN_SIGNAL_DESCRIPTIONS = {
  price_move: 'a bigger price move than usual',
  volume_anomaly: 'far more shares trading than usual',
  range_breach: 'a new session high or low',
};

function describeCoOccurring(coOccurringSignals) {
  if (!coOccurringSignals || coOccurringSignals.length === 0) return null;
  const parts = coOccurringSignals.map((s) => PLAIN_SIGNAL_DESCRIPTIONS[s] || s);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Turns a flagged signal (rule-based, already decided) into a short,
 * plain-language explanation. The LLM does NOT decide significance —
 * the signal engine already did that. This is explanation and framing only,
 * which is a deliberate boundary: keeps the "what" rule-based and auditable,
 * and uses the LLM for the "why does this matter to a human" part it's
 * actually good at.
 */
async function explainAlert({ symbol, signal_type, detail }) {
  const prompt = buildPrompt(symbol, signal_type, detail);

  if (!groq) {
    // Fail gracefully if no API key set — alert still works, just without prose.
    // Deliberate: an alert with a fallback line is better than a broken request
    // mid-demo. Never let a missing/failed LLM call take down the core feature.
    return fallbackExplanation(symbol, signal_type, detail);
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      messages: [
        {
          role: 'system',
          content:
            'You explain stock alerts to ordinary retail investors, not traders. Assume the ' +
            'reader does not know financial terminology. You will be given a detected price, ' +
            'volume, or range-breach event along with real context: how this compares to the ' +
            "stock's own normal behavior, and the shape of its recent movement (steady trend vs " +
            'sudden spike vs choppy). Ground every sentence in that specific data, but say it in ' +
            'plain, everyday words — the same way you would explain it to a friend, out loud.\n\n' +
            'Banned words and phrases — never use these: "threshold", "multiple of", "Nx" or "2.2x" ' +
            'style ratios, "volatility", "normal range", "anomaly", "session", "delta", "basis", ' +
            'or any other trading jargon. Do not state the raw ratio number at all (e.g. do not say ' +
            '"2.2 times").\n\n' +
            'Instead of a ratio, describe size in plain comparative terms: "much bigger than its ' +
            'usual moves", "close to double what it normally moves", "far more shares traded than ' +
            'usual". Instead of "threshold", say what is actually normal for the stock in plain ' +
            'words.\n\n' +
            'Example of BAD (jargon): "GRWFIN rose 3.23%, exceeding its normal move threshold by ' +
            '2.2x, during a choppy price shape."\n' +
            'Example of GOOD (plain): "GRWFIN jumped 3.23% — more than double the size of its usual ' +
            'moves — after bouncing back and forth without a clear direction."\n\n' +
            'Sometimes the input tells you another signal fired on the SAME stock at the SAME time ' +
            '(for example, a price jump alongside a volume surge). When that happens, treat it as ' +
            'one connected event, not two separate facts — weave the connection into one of your ' +
            'sentences (e.g. "...and it came with a lot more shares trading too") instead of ' +
            'ignoring it or bolting on an unrelated third sentence. Still just 1-2 sentences total.\n\n' +
            'Example of BAD (ignores the connection): "GRWFIN jumped 3.76%. GRWFIN also traded far ' +
            'more shares than usual."\n' +
            'Example of GOOD (connects them): "GRWFIN jumped 3.76%, and it came with far more shares ' +
            'trading than usual too — a bigger move than usual on unusually heavy trading."\n\n' +
            'Do not pad sentences with generic hedge phrases like "may indicate" or "could signal" ' +
            'as filler — if you genuinely don\'t know the cause, say what happened concretely and ' +
            'let the reader draw their own conclusion, rather than listing vague possibilities. ' +
            'Do not predict future price direction. Do not give investment advice (no buy/sell/hold ' +
            'language). Reply in exactly 1-2 complete sentences. Always finish your sentences.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 220,
      reasoning_effort: 'low', // this is gpt-oss, a reasoning model — Groq enables reasoning by
      // default, which silently eats into max_tokens with hidden chain-of-thought before the
      // visible answer even starts. A one-sentence paraphrase task doesn't need deep reasoning;
      // low effort leaves the token budget for the actual answer instead of internal thinking.
    });

    const text = completion.choices[0]?.message?.content?.trim();

    // Defensive check: even with reasoning_effort tuned down, an LLM response
    // can still occasionally get cut short (network hiccup, provider-side
    // truncation, etc). A sentence trailing off mid-thought looks broken to a
    // user — worse than the plain fallback text, which is at least complete
    // and correct. If it doesn't end in terminal punctuation, treat it as
    // unusable and fall back rather than show it.
    const looksComplete = text && /[.!?]$/.test(text);

    return looksComplete ? text : fallbackExplanation(symbol, signal_type, detail);
  } catch (err) {
    console.error('[reasoning] Groq call failed, using fallback:', err.message);
    return fallbackExplanation(symbol, signal_type, detail);
  }
}

function buildPrompt(symbol, signal_type, detail) {
  // Note: this prompt deliberately still contains the raw numbers (the model
  // needs real data to ground its answer in) but describes them in plain
  // terms rather than trading-desk labels — "normal move threshold" and "Nx"
  // are exactly the phrases we don't want the model echoing back, so we
  // don't feed them in that shape to begin with. The system prompt bans the
  // jargon as a backstop; this is the actual fix (don't put it in reach).
  let parts;
  if (signal_type === 'price_move') {
    const pct = (detail.pctChange * 100).toFixed(2);
    parts = [`${symbol} moved ${pct}% (from ${detail.previousPrice} to ${detail.currentPrice}).`];
    if (detail.multipleOfThreshold) {
      const usualMovePct = (detail.volatilityThreshold * 100).toFixed(1);
      parts.push(`For context, this stock's price normally moves less than about ${usualMovePct}% at a time — this move was roughly ${detail.multipleOfThreshold.toFixed(1)} times bigger than that.`);
    }
    if (detail.trend) {
      parts.push(`Recent price shape: ${detail.trend}.`);
    }
  } else if (signal_type === 'volume_anomaly') {
    const ratio = detail.ratio.toFixed(1);
    parts = [`${symbol} had ${detail.currentVolume} shares traded, compared to a typical ${Math.round(detail.avgVolume)} shares over its recent average — about ${ratio} times more than usual.`];
    if (detail.trend) {
      parts.push(`Recent volume shape: ${detail.trend}.`);
    }
  } else if (signal_type === 'range_breach') {
    const direction = detail.direction === 'high' ? 'a new session high' : 'a new session low';
    parts = [`${symbol} just hit ${direction} of ${detail.currentPrice}, breaking past its prior ${detail.direction === 'high' ? 'high' : 'low'} of ${detail.priorExtreme} for this session.`];
  } else {
    parts = [`${symbol} triggered a ${signal_type} signal.`];
  }

  const coOccurring = describeCoOccurring(detail.coOccurringSignals);
  if (coOccurring) {
    parts.push(`At the same time, this same stock is ALSO showing: ${coOccurring}. This is one connected event — mention the connection.`);
  }

  return parts.join(' ');
}

function fallbackExplanation(symbol, signal_type, detail) {
  const coOccurring = describeCoOccurring(detail.coOccurringSignals);
  const coOccurringSuffix = coOccurring ? ` — alongside ${coOccurring}` : '';

  if (signal_type === 'price_move') {
    const pct = (detail.pctChange * 100).toFixed(2);
    const direction = detail.pctChange >= 0 ? 'up' : 'down';
    return `${symbol} moved ${direction} ${Math.abs(pct)}% — a bigger move than usual for this stock${coOccurringSuffix}.`;
  }
  if (signal_type === 'volume_anomaly') {
    const ratio = detail.ratio.toFixed(1);
    return `${symbol} had far more shares traded than usual today — about ${ratio} times its normal amount${coOccurringSuffix}.`;
  }
  if (signal_type === 'range_breach') {
    const direction = detail.direction === 'high' ? 'high' : 'low';
    return `${symbol} hit a new session ${direction} of ${detail.currentPrice}${coOccurringSuffix}.`;
  }
  return `${symbol} triggered a notable ${signal_type} signal.`;
}

module.exports = { explainAlert };