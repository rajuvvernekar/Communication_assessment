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
      positiveCount, negativeCount,
      _rawText: text   // preserved for sentence-variety variance calculation
    };
  }

  // Pick & Speak — 15-criterion scoring out of 100
  // Criteria 10 (pronunciation), 11 (intonation), 12 (volume) cannot be
  // measured from text alone; they are excluded from the AI overall and
  // left for admin to score manually.
  function scoreSpeech(analysis, durationSeconds) {
    const scores = {};
    const wpm = analysis.wpm;
    const wordCount = analysis.wordCount;
    const fillerRatio = wordCount > 0 ? analysis.fillerCount / wordCount : 0;
    const uvr = analysis.uniqueWordRatio;
    const asl = analysis.avgWordsPerSentence;
    const sc = analysis.sentenceCount;

    // ── 1. Clarity of Thought (avg sentence length 10-22 = clear)
    if (wordCount === 0) scores.clarity = 1;
    else if (asl >= 10 && asl <= 22) scores.clarity = 5;
    else if (asl >= 7  && asl <= 28) scores.clarity = 4;
    else if (asl >= 5  && asl <= 35) scores.clarity = 3;
    else scores.clarity = 2;

    // ── 2. Logical Flow / Structure (sufficient sentences + words)
    if (sc >= 7 && wordCount >= 110) scores.logicalFlow = 5;
    else if (sc >= 5 && wordCount >= 70)  scores.logicalFlow = 4;
    else if (sc >= 3 && wordCount >= 40)  scores.logicalFlow = 3;
    else if (sc >= 1)                     scores.logicalFlow = 2;
    else                                  scores.logicalFlow = 1;

    // ── 3. Relevance to Topic (word count vs expected for duration)
    const expected = (durationSeconds / 60) * 120;
    const coverage = wordCount / Math.max(expected, 1);
    if (coverage > 0.75)      scores.relevance = 5;
    else if (coverage > 0.55) scores.relevance = 4;
    else if (coverage > 0.35) scores.relevance = 3;
    else if (coverage > 0.15) scores.relevance = 2;
    else                      scores.relevance = 1;

    // ── 4. Grammar Accuracy (sentence regularity proxy)
    let grammar;
    if (sc >= 5 && asl >= 8)      grammar = 5;
    else if (sc >= 3 && asl >= 6) grammar = 4;
    else if (sc >= 2 && asl >= 4) grammar = 3;
    else if (wordCount > 0)       grammar = 2;
    else                          grammar = 1;
    scores.grammar = grammar;

    // ── 5. Vocabulary Appropriateness (unique-word ratio + no slang)
    const lowerText = (analysis._rawText || '').toLowerCase();
    const slang = ['gonna','wanna','gotta','kinda','sorta','ya','yeah','nope','yep','dunno','dude','stuff'];
    const slangHits = slang.filter(s => lowerText.includes(s)).length;
    let vocab;
    if (uvr > 0.72 && slangHits === 0) vocab = 5;
    else if (uvr > 0.60 && slangHits <= 1) vocab = 4;
    else if (uvr > 0.45 && slangHits <= 2) vocab = 3;
    else if (uvr > 0.30) vocab = 2;
    else vocab = 1;
    scores.vocabulary = vocab;

    // ── 6. Sentence Variety (variance in sentence lengths)
    let sentenceVariety = 3; // default mid
    if (sc >= 3) {
      // Re-split sentences from analysis
      const rawText = analysis._rawText || '';
      const sents = rawText.split(/[.!?]+/).filter(s => s.trim().length > 4);
      if (sents.length >= 3) {
        const lens = sents.map(s => s.trim().split(/\s+/).length);
        const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
        const variance = lens.reduce((s, l) => s + Math.pow(l - mean, 2), 0) / lens.length;
        if (variance > 45)      sentenceVariety = 5;
        else if (variance > 25) sentenceVariety = 4;
        else if (variance > 10) sentenceVariety = 3;
        else if (variance > 3)  sentenceVariety = 2;
        else                    sentenceVariety = 1;
      }
    }
    scores.sentenceVariety = sentenceVariety;

    // ── 7. Fluency (WPM, penalised by filler ratio)
    let fluency;
    if (wpm === 0)        fluency = 1;
    else if (wpm < 60)    fluency = 2;
    else if (wpm < 100)   fluency = 3;
    else if (wpm <= 160)  fluency = 5;
    else if (wpm <= 200)  fluency = 4;
    else                  fluency = 3;
    if (fillerRatio > 0.15) fluency = Math.max(1, fluency - 2);
    else if (fillerRatio > 0.08) fluency = Math.max(1, fluency - 1);
    scores.fluency = fluency;

    // ── 8. Pace of Speech (ideal conversational 100-150 WPM)
    let pace;
    if (wpm === 0)        pace = 1;
    else if (wpm < 70)    pace = 2; // too slow
    else if (wpm < 100)   pace = 3;
    else if (wpm <= 150)  pace = 5; // ideal
    else if (wpm <= 185)  pace = 4; // slightly fast
    else                  pace = 2; // too fast
    scores.pace = pace;

    // ── 9. Filler Word Control
    if (fillerRatio < 0.01)      scores.fillerControl = 5;
    else if (fillerRatio < 0.03) scores.fillerControl = 4;
    else if (fillerRatio < 0.06) scores.fillerControl = 3;
    else if (fillerRatio < 0.10) scores.fillerControl = 2;
    else                         scores.fillerControl = 1;

    // ── 10. Pronunciation Clarity — cannot measure from text (admin only)
    // ── 11. Intonation & Stress   — cannot measure from text (admin only)
    // ── 12. Volume & Audibility   — cannot measure from text (admin only)

    // ── 13. Confidence (low hedge/self-correction phrases)
    const hedges = ["i think","i mean","you know","kind of","sort of","i guess","maybe","perhaps","i'm not sure","i don't know"];
    const hedgeHits = hedges.filter(h => lowerText.includes(h)).length;
    if (hedgeHits === 0 && fillerRatio < 0.03)       scores.confidence = 5;
    else if (hedgeHits <= 1 && fillerRatio < 0.06)   scores.confidence = 4;
    else if (hedgeHits <= 2 && fillerRatio < 0.10)   scores.confidence = 3;
    else if (hedgeHits <= 3)                         scores.confidence = 2;
    else                                             scores.confidence = 1;

    // ── 14. Tone & Professionalism (positive tone, no slang)
    let professionalism;
    if (slangHits === 0 && analysis.toneScore >= 2)      professionalism = 5;
    else if (slangHits <= 1 && analysis.toneScore >= 0)  professionalism = 4;
    else if (slangHits <= 2)                             professionalism = 3;
    else if (slangHits <= 3)                             professionalism = 2;
    else                                                 professionalism = 1;
    scores.professionalism = professionalism;

    // ── 15. Time Management (vs 120-second target)
    const target = 120;
    const diff = Math.abs(durationSeconds - target) / target;
    if (diff <= 0.10)      scores.timeManagement = 5;
    else if (diff <= 0.20) scores.timeManagement = 4;
    else if (diff <= 0.35) scores.timeManagement = 3;
    else if (diff <= 0.50) scores.timeManagement = 2;
    else                   scores.timeManagement = 1;

    // ── Overall: average of 12 AI-scoreable criteria (exclude 10/11/12)
    const aiKeys = ['clarity','logicalFlow','relevance','grammar','vocabulary',
                    'sentenceVariety','fluency','pace','fillerControl',
                    'confidence','professionalism','timeManagement'];
    const aiSum = aiKeys.reduce((s, k) => s + (scores[k] || 0), 0);
    scores.overall = parseFloat(((aiSum / (aiKeys.length * 5)) * 100).toFixed(1));
    scores._method = 'js';
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
