'use strict';

const SpeechEngine = (() => {
  let _recognition = null;
  let _transcript = '';
  let _startTime = null;
  let _onUpdate = null;
  let _supported = false;

  const FILLER_WORDS = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'basically', 'literally',
    'actually', 'so', 'right', 'okay', 'hmm', 'sort of', 'kind of', 'i mean'];

  const POSITIVE_WORDS = ['excellent', 'great', 'good', 'positive', 'improve', 'benefit', 'advantage',
    'opportunity', 'success', 'achieve', 'effective', 'efficient', 'productive', 'innovative',
    'solution', 'collaborate', 'growth', 'support', 'professional', 'clear'];

  const NEGATIVE_WORDS = ['problem', 'issue', 'difficult', 'challenge', 'fail', 'bad', 'wrong',
    'mistake', 'error', 'concern', 'risk', 'trouble', 'impossible', 'cannot', 'never', 'poor'];

  function isSupported() {
    _supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    return _supported;
  }

  function startTranscription(onUpdate) {
    if (!_supported) return;
    _transcript = '';
    _onUpdate = onUpdate;
    _startTime = Date.now();

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _recognition = new SR();
    _recognition.continuous = true;
    _recognition.interimResults = true;
    _recognition.lang = 'en-US';

    let finalTranscript = '';

    _recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript + ' ';
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      _transcript = finalTranscript + interim;
      if (_onUpdate) _onUpdate(_transcript);
    };

    _recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('Speech recognition error:', e.error);
      }
    };

    _recognition.onend = () => {
      // Auto-restart if still recording (recognition can time out)
      if (_recognition) {
        try { _recognition.start(); } catch (_) {}
      }
    };

    _recognition.start();
  }

  function stopTranscription() {
    if (_recognition) {
      _recognition.onend = null;
      try { _recognition.stop(); } catch (_) {}
      _recognition = null;
    }
    return _transcript.trim();
  }

  function analyze(text, durationSeconds) {
    if (!text || !text.trim()) {
      return {
        wordCount: 0, uniqueWordRatio: 0, fillerCount: 0, wpm: 0,
        sentenceCount: 0, avgWordsPerSentence: 0, toneScore: 0,
        fillerWords: [], positiveCount: 0, negativeCount: 0
      };
    }

    const words = text.toLowerCase().match(/\b[a-z']+\b/g) || [];
    const wordCount = words.length;

    const uniqueWords = new Set(words);
    const uniqueWordRatio = wordCount > 0 ? (uniqueWords.size / wordCount) : 0;

    // Count filler words
    const fillerWordsFound = [];
    let fillerCount = 0;
    const lowerText = text.toLowerCase();
    FILLER_WORDS.forEach(fw => {
      const regex = new RegExp(`\\b${fw}\\b`, 'g');
      const matches = lowerText.match(regex);
      if (matches && matches.length > 0) {
        fillerCount += matches.length;
        fillerWordsFound.push({ word: fw, count: matches.length });
      }
    });

    const durationMinutes = (durationSeconds || 120) / 60;
    const wpm = durationMinutes > 0 ? Math.round(wordCount / durationMinutes) : 0;

    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
    const sentenceCount = sentences.length;
    const avgWordsPerSentence = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;

    // Tone analysis
    let positiveCount = 0, negativeCount = 0;
    POSITIVE_WORDS.forEach(w => { if (lowerText.includes(w)) positiveCount++; });
    NEGATIVE_WORDS.forEach(w => { if (lowerText.includes(w)) negativeCount++; });
    const toneScore = positiveCount - negativeCount;

    return {
      wordCount, uniqueWordRatio, fillerCount, wpm, sentenceCount,
      avgWordsPerSentence, toneScore, fillerWords: fillerWordsFound,
      positiveCount, negativeCount
    };
  }

  function scoreSpeech(analysis, durationSeconds) {
    const scores = {};

    // Fluency: ideal WPM 110-160, penalize extremes
    let fluency;
    const wpm = analysis.wpm;
    if (wpm === 0) fluency = 1;
    else if (wpm < 60) fluency = 2;
    else if (wpm < 100) fluency = 3;
    else if (wpm <= 160) fluency = 5;
    else if (wpm <= 200) fluency = 4;
    else fluency = 3;

    // Filler words: penalize heavy usage
    const fillerRatio = analysis.wordCount > 0 ? analysis.fillerCount / analysis.wordCount : 0;
    if (fillerRatio > 0.15) fluency = Math.max(1, fluency - 2);
    else if (fillerRatio > 0.08) fluency = Math.max(1, fluency - 1);

    scores.fluency = fluency;

    // Vocabulary: based on unique word ratio
    const uvr = analysis.uniqueWordRatio;
    if (uvr > 0.75) scores.vocabulary = 5;
    else if (uvr > 0.65) scores.vocabulary = 4;
    else if (uvr > 0.50) scores.vocabulary = 3;
    else if (uvr > 0.35) scores.vocabulary = 2;
    else scores.vocabulary = 1;

    // Content length adequacy (vs expected duration)
    const expected = (durationSeconds / 60) * 120; // ~120 WPM expected
    const coverage = analysis.wordCount / Math.max(expected, 1);
    if (coverage > 0.75) scores.contentCoverage = 5;
    else if (coverage > 0.55) scores.contentCoverage = 4;
    else if (coverage > 0.35) scores.contentCoverage = 3;
    else if (coverage > 0.15) scores.contentCoverage = 2;
    else scores.contentCoverage = 1;

    scores.overall = parseFloat(((scores.fluency + scores.vocabulary + scores.contentCoverage) / 3).toFixed(1));
    return scores;
  }

  function scoreWriting(text, durationSeconds) {
    const analysis = analyze(text, durationSeconds);
    const scores = {};

    // Clarity: based on avg sentence length (15-25 words is ideal)
    const asl = analysis.avgWordsPerSentence;
    if (asl >= 12 && asl <= 25) scores.clarity = 5;
    else if (asl >= 8 && asl <= 30) scores.clarity = 4;
    else if (asl >= 5 && asl <= 35) scores.clarity = 3;
    else scores.clarity = 2;

    // Structure: based on sentence count and word count
    if (analysis.sentenceCount >= 5 && analysis.wordCount >= 80) scores.structure = 5;
    else if (analysis.sentenceCount >= 3 && analysis.wordCount >= 50) scores.structure = 4;
    else if (analysis.sentenceCount >= 2 && analysis.wordCount >= 30) scores.structure = 3;
    else scores.structure = 2;

    // Tone: based on positive word usage
    if (analysis.positiveCount >= 5) scores.tone = 5;
    else if (analysis.positiveCount >= 3) scores.tone = 4;
    else if (analysis.positiveCount >= 1) scores.tone = 3;
    else scores.tone = 2;

    scores.overall = parseFloat(((scores.clarity + scores.structure + scores.tone) / 3).toFixed(1));
    return scores;
  }

  // ---- Mock Call JS-based phrase scoring (fallback when Claude API unavailable) ----
  function scoreMockCall(transcript) {
    const t = (transcript || '').toLowerCase();
    const words = t.match(/\b[a-z']+\b/g) || [];
    const scores = {};

    // Call Opening: greeting + self-intro + company + offer (each = +1, 4 = score 5)
    let opening = 0;
    if (/good (morning|afternoon|evening)/i.test(transcript)) opening++;
    if (/thank(s| you) for calling/i.test(transcript)) opening++;
    if (/my name is|i('m| am) [a-z]+,/i.test(transcript)) opening++;
    if (/how (may|can) i (assist|help)/i.test(transcript)) opening++;
    scores.callOpening = opening >= 4 ? 5 : opening === 3 ? 4 : opening === 2 ? 3 : opening === 1 ? 2 : 1;

    // Acknowledgment: empathy phrases
    const empathyPhrases = ['i understand', 'i apologize', "i'm sorry", 'that must be', 'i can imagine', 'i see', 'i hear you', 'i completely understand'];
    const empathyCount = empathyPhrases.filter(p => t.includes(p)).length;
    scores.acknowledgment = empathyCount >= 3 ? 5 : empathyCount === 2 ? 4 : empathyCount === 1 ? 3 : 2;

    // Active Listening: unique word ratio as vocabulary diversity proxy
    const uniqueRatio = words.length > 0 ? new Set(words).size / words.length : 0;
    if (uniqueRatio > 0.70) scores.activeListening = 5;
    else if (uniqueRatio > 0.60) scores.activeListening = 4;
    else if (uniqueRatio > 0.48) scores.activeListening = 3;
    else scores.activeListening = 2;

    // Communication Clarity: filler word ratio
    const analysis = analyze(transcript, 180);
    const fillerRatio = words.length > 0 ? analysis.fillerCount / words.length : 0;
    if (fillerRatio < 0.02) scores.communicationClarity = 5;
    else if (fillerRatio < 0.05) scores.communicationClarity = 4;
    else if (fillerRatio < 0.10) scores.communicationClarity = 3;
    else if (fillerRatio < 0.15) scores.communicationClarity = 2;
    else scores.communicationClarity = 1;

    // Call Essence: polite / rapport phrases
    const essencePhrases = ['please', 'certainly', 'absolutely', 'of course', 'happy to', 'glad to', 'my pleasure', 'great question', 'thank you for', 'appreciate'];
    const essenceCount = essencePhrases.filter(p => t.includes(p)).length;
    if (essenceCount >= 4) scores.callEssence = 5;
    else if (essenceCount >= 2) scores.callEssence = 4;
    else if (essenceCount >= 1) scores.callEssence = 3;
    else scores.callEssence = 2;

    // Hold Procedure (1/3/5): asked permission + time expectation
    const askedHold = /may i (put|place) you on hold|can i (put|place) you on hold/i.test(transcript);
    const gaveTime = /(\d+\s*(minute|second)|a (moment|minute|brief moment))/i.test(transcript);
    scores.holdProcedure = askedHold && gaveTime ? 5 : askedHold ? 3 : 1;

    // Extra Mile (1/3/5): proactive offers beyond the query
    const extraPhrases = ['also want to let you know', 'i\'d also', 'additionally', 'by the way', 'one more thing', 'you might also', 'in the meantime'];
    const extraCount = extraPhrases.filter(p => t.includes(p)).length;
    scores.extraMile = extraCount >= 2 ? 5 : extraCount >= 1 ? 3 : 1;

    // Call Closing (1/3/5): resolved confirmation + anything else + branded close
    const confirmed = /is (that|this|everything) (resolved|sorted|clear|fine|good)|resolved your|sorted your|taken care/i.test(transcript);
    const anythingElse = /anything else|anything (more|other)|other (question|concern|issue)|further (assistance|help)/i.test(transcript);
    const brandedClose = /thank(s| you) for calling|have a (great|good|wonderful|nice|lovely) (day|evening|afternoon|morning)/i.test(transcript);
    const closingScore = [confirmed, anythingElse, brandedClose].filter(Boolean).length;
    scores.callClosing = closingScore === 3 ? 5 : closingScore >= 1 ? 3 : 1;

    // Overall: average of all criteria scores
    const vals = Object.values(scores);
    scores.overall = parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));

    return scores;
  }

  return { isSupported, startTranscription, stopTranscription, analyze, scoreSpeech, scoreWriting, scoreMockCall };
})();
