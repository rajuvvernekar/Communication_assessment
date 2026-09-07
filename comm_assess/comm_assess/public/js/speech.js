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
          // Capitalize first letter and ensure the segment ends with punctuation
          const seg = e.results[i][0].transcript.trim();
          if (seg) {
            const cap = seg.charAt(0).toUpperCase() + seg.slice(1);
            finalTranscript += (/[.!?]$/.test(cap) ? cap : cap + '.') + ' ';
          }
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

  function scoreWriting(text, durationSeconds, topicTitle) {
    const analysis = analyze(text, durationSeconds);
    const scores = {};
    const lowerText = (text || '').toLowerCase();
    const titleLower = (topicTitle || '').toLowerCase();

    // --- HEURISTICS BASE SCORES ---
    // 1. Tone & Empathy (criterion_0): count empathy words/phrases
    const empathyPhrases = ['sorry', 'apologize', 'apologies', 'understand', 'inconvenience', 'concern', 'regret'];
    let empathyCount = 0;
    empathyPhrases.forEach(w => { if (lowerText.includes(w)) empathyCount++; });
    let toneScore = empathyCount >= 3 ? 5 : empathyCount === 2 ? 4 : empathyCount === 1 ? 3 : 2;

    // 2. Clarity (criterion_1): based on avg sentence length (12-25 words is ideal)
    const asl = analysis.avgWordsPerSentence;
    let clarityScore = 2;
    if (asl >= 12 && asl <= 25) clarityScore = 5;
    else if (asl >= 8 && asl <= 30) clarityScore = 4;
    else if (asl >= 5 && asl <= 35) clarityScore = 3;

    // 3. Ownership (criterion_2): based on sentence count and word count
    let ownershipScore = 2;
    if (analysis.sentenceCount >= 5 && analysis.wordCount >= 80) ownershipScore = 5;
    else if (analysis.sentenceCount >= 3 && analysis.wordCount >= 50) ownershipScore = 4;
    else if (analysis.sentenceCount >= 2 && analysis.wordCount >= 30) ownershipScore = 3;

    // 4. Accuracy (criterion_3): positive helpful language / sentence variety
    let accuracyScore = 2;
    if (analysis.positiveCount >= 4) accuracyScore = 5;
    else if (analysis.positiveCount >= 2) accuracyScore = 4;
    else if (analysis.positiveCount >= 1) accuracyScore = 3;

    // 5. Customer Education (criterion_4): business explanatory phrases
    const explanatoryWords = ['because', 'due to', 'as', 'since', 'policy', 'tat', 'working days', 'safeguard', 'ensure', 'prevent'];
    let explanationCount = 0;
    explanatoryWords.forEach(w => { if (lowerText.includes(w)) explanationCount++; });
    let edScore = explanationCount >= 3 ? 5 : explanationCount === 2 ? 4 : explanationCount === 1 ? 3 : 2;

    // 6. Grammar & Language (criterion_5): vocabulary and grammar indicator (using uniqueWordRatio)
    const uvr = analysis.uniqueWordRatio;
    let langScore = 2;
    if (uvr >= 0.7 && analysis.wordCount >= 50) langScore = 5;
    else if (uvr >= 0.6 && analysis.wordCount >= 40) langScore = 4;
    else if (uvr >= 0.5) langScore = 3;

    // --- GENERAL STRICT PUNISHMENTS ---
    // Spelling mistake "inconvinence" or "inconveninece"
    if (lowerText.includes('inconvinence') || lowerText.includes('inconveninece')) {
      langScore = Math.min(langScore, 2);
      toneScore = Math.min(toneScore, 2);
    }
    // Repetitive canned empathy "regret the inconvenience caused"
    if (lowerText.includes('regret the inconvenience caused') || lowerText.includes('regret the inconvenience')) {
      toneScore = Math.min(toneScore, 3);
    }
    // Contradictions check: saying "disabled" or "blocked" and also saying "no restriction" or "unrestricted"
    if ((lowerText.includes('disabled') || lowerText.includes('block')) && 
        (lowerText.includes('no restriction') || lowerText.includes('without restriction'))) {
      clarityScore = Math.min(clarityScore, 2);
    }

    // --- TOPIC-SPECIFIC STRICT EVALUATION ---
    if (titleLower.includes('takeover') || titleLower.includes('insist')) {
      // Topic: Takeover Offer – Client Insists Despite Higher Market Price
      // Empathy: must address decision/autonomy
      if (!lowerText.includes('decision') && !lowerText.includes('autonomy') && !lowerText.includes('behalf')) {
        toneScore = Math.min(toneScore, 3);
      }
      // Clarity: must mention support/ticket/manual option
      if (!lowerText.includes('support') && !lowerText.includes('ticket') && !lowerText.includes('manual') && !lowerText.includes('contact')) {
        clarityScore = Math.min(clarityScore, 2);
      }
      // Ownership: must explain policy reason (preventing accidental acceptance at lower price / financial disadvantage)
      const hasReason = lowerText.includes('prevent') || lowerText.includes('safeguard') || lowerText.includes('disadvantage') || lowerText.includes('lower than');
      if (!hasReason) {
        ownershipScore = Math.min(ownershipScore, 2);
      }
      // Accuracy: internal policy vs regulatory mandate
      if (lowerText.includes('regulatory') || lowerText.includes('government rule') || lowerText.includes('sebi mandate')) {
        accuracyScore = Math.min(accuracyScore, 2);
      } else if (!lowerText.includes('internal') && !lowerText.includes('safeguard') && !lowerText.includes('policy')) {
        accuracyScore = Math.min(accuracyScore, 3);
      }
      // Customer Education: financial disadvantage explanation
      if (!lowerText.includes('financial') && !lowerText.includes('loss') && !lowerText.includes('disadvantage') && !lowerText.includes('prevailing')) {
        edScore = Math.min(edScore, 2);
      }
    } else if (titleLower.includes('name change') || titleLower.includes('gazette')) {
      // Topic: Name Change Dispute – Gazette Requirement
      if (!lowerText.includes('gazette')) {
        ownershipScore = Math.min(ownershipScore, 1);
        clarityScore = Math.min(clarityScore, 2);
      }
      if (!lowerText.includes('sebi') && !lowerText.includes('cdsl') && !lowerText.includes('nsdl') && !lowerText.includes('depository') && !lowerText.includes('regulation')) {
        edScore = Math.min(edScore, 2);
      }
    } else if (titleLower.includes('nav date') || titleLower.includes('dispute') || titleLower.includes('aggregator')) {
      // Topic: NAV Date Dispute (Payment Aggregator Delay)
      if (lowerText.includes('refund') && (lowerText.includes('will refund') || lowerText.includes('process refund') || lowerText.includes('compensate'))) {
        // Promising refund when not allowed is a critical accuracy failure
        accuracyScore = Math.min(accuracyScore, 1);
      }
      if (!lowerText.includes('sebi') && !lowerText.includes('realiz') && !lowerText.includes('amc')) {
        edScore = Math.min(edScore, 2);
      }
      if (!lowerText.includes('audit') && !lowerText.includes('gateway') && !lowerText.includes('log') && !lowerText.includes('tat')) {
        ownershipScore = Math.min(ownershipScore, 2);
      }
    } else if (titleLower.includes('ncrp') || titleLower.includes('lien')) {
      // Topic: NCRP Lien – Delayed Payment Charges on Frozen Funds
      if (!lowerText.includes('cyber') && !lowerText.includes('police') && !lowerText.includes('ncrp') && !lowerText.includes('directive')) {
        edScore = Math.min(edScore, 2);
      }
      if (!lowerText.includes('noc')) {
        ownershipScore = Math.min(ownershipScore, 3);
      }
      if (!lowerText.includes('charges') && !lowerText.includes('interest') && !lowerText.includes('debit')) {
        accuracyScore = Math.min(accuracyScore, 3);
      }
    }

    scores.criterion_0 = toneScore;
    scores.criterion_1 = clarityScore;
    scores.criterion_2 = ownershipScore;
    scores.criterion_3 = accuracyScore;
    scores.criterion_4 = edScore;
    scores.criterion_5 = langScore;

    // Overall: average of the 6 criteria out of 5 (so overall is <= 5, compatible with normalization)
    const sum = scores.criterion_0 + scores.criterion_1 + scores.criterion_2 + scores.criterion_3 + scores.criterion_4 + scores.criterion_5;
    scores.overall = parseFloat((sum / 6).toFixed(1));
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

    // Call Closing (1/3/5): confirmed resolution + asked "anything else" + warm branded close
    const askedAnythingElse = /is there (anything|something) (else|more) (i can|i could|i may) (help|assist)/i.test(transcript)
      || /anything else (i can|i could|i may) (help|assist|do)/i.test(transcript);
    const warmClose = /thank(s| you) for calling|have a (great|good|wonderful|nice|lovely) (day|evening|morning|afternoon)|it('s| is) (been )?a pleasure|take care|goodbye|good bye/i.test(transcript);
    const confirmedResolution = /i('ve| have) (resolved|sorted|taken care of|fixed)|is (everything|that) (sorted|resolved|okay now|all good|all set)/i.test(transcript)
      || /your (issue|problem|concern|request) (has been|is) (resolved|sorted|addressed)/i.test(transcript);
    const closingCount = [askedAnythingElse, warmClose, confirmedResolution].filter(Boolean).length;
    scores.callClosing = closingCount >= 3 ? 5 : closingCount >= 1 ? 3 : 1;

    // Overall: average of all criteria scores (out of 5), converted to percentage out of 100
    const vals = Object.values(scores);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    scores.overall = parseFloat(((avg / 5) * 100).toFixed(1));

    return scores;
  }

  // ================================================================
  //  COACHING SUMMARY GENERATOR
  // ================================================================

  // source: 'ai' (default) | 'admin'
  function generateCoachingSummary(module, scores, source) {
    if (!scores) return '';
    const title = source === 'admin' ? 'Admin Coaching Summary' : 'AI Coaching Summary';
    // Handle all Pick & Speak subcategories
    if (module === 'pick-speak' || module === 'pick-speak-general' || module === 'pick-speak-stock')
      return _pickSpeakCoach(scores, title);
    if (module === 'mock-call')         return _mockCallCoach(scores, title);
    if (module === 'written-comm')      return _writingCoach(scores, title);
    if (module === 'role-play')         return _rolePlayCoach(scores, title);
    if (module === 'group-discussion')  return _groupDiscussionCoach(scores, title);
    return '';
  }

  function _pickSpeakCoach(scores, title) {
    const LABELS = {
      clarity: 'Clarity of Expression', logicalFlow: 'Logical Flow', relevance: 'Relevance & Focus',
      grammar: 'Grammar & Language', vocabulary: 'Vocabulary Range', sentenceVariety: 'Sentence Variety',
      fluency: 'Fluency', pace: 'Pace & Delivery', fillerControl: 'Filler Word Control',
      confidence: 'Confidence', professionalism: 'Professionalism', timeManagement: 'Time Management'
    };
    const ADVICE = {
      clarity:         'Express ideas in simpler, direct sentences. Avoid jargon unless essential, and define terms your audience may not know.',
      logicalFlow:     'Structure your response with a clear opening, middle, and close. Use linking words like "first", "then", and "finally" to guide the listener.',
      relevance:       'Stay focused on the question given. Before answering, identify the key point you want to make — then stick to it.',
      grammar:         'Review subject-verb agreement and tense consistency. Reading aloud for 10 minutes daily builds natural grammar awareness.',
      vocabulary:      'Expand your word bank by reading industry content daily. Aim to introduce at least one new professional term per response.',
      sentenceVariety: 'Mix short, punchy sentences with longer explanatory ones. Monotone sentence structure makes content harder to follow.',
      fluency:         'Practice speaking on random topics for 1 minute without stopping. Focus on continuous flow rather than perfection.',
      pace:            'Record yourself and listen back. Mark natural pause points if you speak too fast; time yourself against a target if too slow.',
      fillerControl:   'Replace fillers ("um", "uh", "like") with a deliberate pause — silence is more powerful and confident than filler words.',
      confidence:      'Confidence grows through preparation. Rehearse key points beforehand, and maintain upright posture to signal self-assurance.',
      professionalism: 'Use formal language and avoid slang. Begin and end with structured, courteous phrases to demonstrate professionalism.',
      timeManagement:  'Practice timed speaking — set a 2-minute timer and cover your point within it. Both over-running and under-running indicate poor preparation.'
    };
    return _buildSummary(scores, LABELS, ADVICE, title);
  }

  function _mockCallCoach(scores, title) {
    const LABELS = {
      callOpening:          'Call Opening',
      acknowledgment:       'Acknowledgment',
      communicationClarity: 'Communication Clarity',
      callEssence:          'Call Essence',
      holdProcedure:        'Hold Procedure',
      extraMile:            'Extra Mile',
      callClosing:          'Call Closing'   // scored by admin only; ignored if absent in AI scores
    };
    const ADVICE = {
      callOpening:          'Greet warmly, state your name and company, and invite the customer to share their concern. A strong opening sets the tone for the entire call.',
      acknowledgment:       'Acknowledge the customer\'s issue before jumping to solutions. Phrases like "I understand how frustrating that must be" demonstrate genuine empathy.',
      communicationClarity: 'Avoid jargon, speak in short sentences, and confirm understanding at key points. "Does that make sense?" is a simple but effective check.',
      callEssence:          'Use positive language throughout — "certainly", "happy to help", and "absolutely" create a warm, customer-first atmosphere.',
      holdProcedure:        'Always ask permission before placing a customer on hold, state the expected wait time, and thank them for holding when you return.',
      extraMile:            'Look for opportunities to add value — share a useful tip, flag upcoming offers, or proactively confirm adjacent account details.',
      callClosing:          'Confirm resolution, ask "Is there anything else I can help you with?", and close with a warm sign-off like "Thank you for calling, have a great day."'
    };
    return _buildSummary(scores, LABELS, ADVICE, title);
  }

  function _writingCoach(scores, title) {
    // Covers both legacy AI score keys (clarity/structure/tone) and the new 6 parameters
    const LABELS = {
      clarity:     'Clarity',        structure:    'Structure',  tone:         'Tone',
      criterion_0: 'Tone & Empathy',
      criterion_1: 'Clarity',
      criterion_2: 'Ownership',
      criterion_3: 'Accuracy',
      criterion_4: 'Customer Education',
      criterion_5: 'Grammar & Language'
    };
    const ADVICE = {
      clarity:     'Use shorter sentences and active voice. Each paragraph should have one clear idea. Avoid ambiguous pronouns — state who did what explicitly.',
      structure:   'Follow a clear opening-body-close format. Use paragraph breaks and bullet points where appropriate to improve readability.',
      tone:        'Match your tone to your audience — professional but approachable. Avoid being too casual (slang) or overly formal (stiff language).',
      criterion_0: 'Acknowledge the customer\'s specific concern and policy rationale with empathy. Avoid repetitive, canned apologetic phrases.',
      criterion_1: 'Express ideas clearly and consistently. Avoid contradictions like saying an option is disabled and later stating there is no restriction.',
      criterion_2: 'Answer the customer\'s actual underlying questions. Take full ownership of why a policy is in place rather than just stating rules.',
      criterion_3: 'Ensure technical accuracy in your explanations. Clearly differentiate UI/Console limitations from manual support options.',
      criterion_4: 'Educate the customer with strong business rationale. Explain how policy safeguards prevent unintended financial disadvantages.',
      criterion_5: 'Maintain high language quality. Check for spelling errors (e.g. "inconvenience"), avoid run-on sentences, and reduce repetitive closings.'
    };
    return _buildSummary(scores, LABELS, ADVICE, title);
  }

  function _rolePlayCoach(scores, title) {
    // Admin scoring keys: criterion_0 Empathy, criterion_1 Assertiveness,
    //                     criterion_2 Resolution Approach, criterion_3 Professionalism
    const LABELS = {
      criterion_0: 'Empathy',
      criterion_1: 'Assertiveness',
      criterion_2: 'Resolution Approach',
      criterion_3: 'Professionalism'
    };
    const ADVICE = {
      criterion_0: 'Acknowledge the other person\'s feelings before offering solutions. Phrases like "I understand how you feel" validate their concerns and build trust.',
      criterion_1: 'State your position clearly and confidently using "I" statements. Be firm but respectful — assertiveness is not aggression.',
      criterion_2: 'Offer practical, actionable solutions and confirm the other party agrees before closing. Follow through on any commitments made.',
      criterion_3: 'Maintain composure under pressure, use appropriate workplace language, and model the professional behaviour expected in the role.'
    };
    return _buildSummary(scores, LABELS, ADVICE, title);
  }

  function _groupDiscussionCoach(scores, title) {
    // Admin scoring keys: criterion_0 Participation Quality, criterion_1 Argumentation,
    //                     criterion_2 Responsiveness, criterion_3 Communication Clarity
    const LABELS = {
      criterion_0: 'Participation Quality',
      criterion_1: 'Argumentation',
      criterion_2: 'Responsiveness',
      criterion_3: 'Communication Clarity'
    };
    const ADVICE = {
      criterion_0: 'Contribute meaningfully and consistently. Make relevant points that advance the discussion, and demonstrate preparation by referencing specific facts or examples.',
      criterion_1: 'Support your views with evidence, data, or logical reasoning. Avoid vague claims — precision and structure strengthen your argument significantly.',
      criterion_2: 'Listen actively and respond directly to what others say. Acknowledge differing views respectfully, then build on or counter them with reasoning.',
      criterion_3: 'Speak clearly, structure your points logically, and keep contributions concise. Avoid interrupting others and use formal, professional language throughout.'
    };
    return _buildSummary(scores, LABELS, ADVICE, title);
  }

  function _buildSummary(scores, labels, advice, title = 'Coaching Summary') {
    const entries = Object.entries(scores).filter(
      ([k, v]) => !k.startsWith('_') && k !== 'overall' && typeof v === 'number' && labels[k]
    );
    // No matching score keys — unsupported module or empty scores; return nothing
    if (entries.length === 0) return '';
    const strong  = entries.filter(([, v]) => v >= 4).sort((a, b) => b[1] - a[1]);
    const develop = entries.filter(([, v]) => v <  4).sort((a, b) => a[1] - b[1]); // worst first

    const lines = [];
    lines.push(title);
    lines.push('──────────────────────────────────────');

    if (strong.length > 0) {
      lines.push('');
      lines.push('Strengths:');
      strong.forEach(([k]) => lines.push('  \u2022 ' + labels[k]));
    }

    if (develop.length > 0) {
      lines.push('');
      lines.push('Development Areas (prioritised by impact):');
      develop.forEach(([k, v]) => {
        const level = v <= 2 ? 'Needs significant work' : 'Room for improvement';
        lines.push('  \u2022 ' + labels[k] + ' (' + v + '/5 \u2014 ' + level + ')');
        if (advice[k]) lines.push('    \u2192 ' + advice[k]);
      });
      lines.push('');
      const [worstKey] = develop[0];
      lines.push('Priority Action: Start with "' + labels[worstKey] + '" \u2014 this is the highest-impact area to address first.');
    } else {
      lines.push('');
      lines.push('Excellent performance across all criteria! Maintain consistency and consider mentoring peers.');
    }

    return lines.join('\n');
  }

  return { isSupported, startTranscription, stopTranscription, analyze, scoreSpeech, scoreWriting, scoreMockCall, generateCoachingSummary };
})();
