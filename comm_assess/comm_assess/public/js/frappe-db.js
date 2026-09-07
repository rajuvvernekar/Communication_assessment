/**
 * CommAssess — Frappe Database Adapter
 * Replaces Supabase backend with Frappe Framework REST API endpoints.
 */

window.CommDB = {
    // Current logged-in trainee context
    currentTrainee: null,

    /**
     * Register or fetch trainee info by Full Name and Employee ID.
     */
    async registerOrGetTrainee(fullName, empId) {
        try {
            const res = await fetch('/api/method/comm_assess.api.register_or_get_trainee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: fullName, emp_id: empId })
            });
            const data = await res.json();
            if (data.message) {
                this.currentTrainee = data.message;
                localStorage.setItem('comm_assess_trainee', JSON.stringify(data.message));
                return { data: data.message, error: null };
            }
            return { data: null, error: data.exception || 'Failed to authenticate trainee' };
        } catch (err) {
            console.error('[FrappeDB] registerOrGetTrainee error:', err);
            return { data: null, error: err.message };
        }
    },

    /**
     * Get active trainee from local storage or memory.
     */
    getTrainee() {
        if (!this.currentTrainee) {
            const saved = localStorage.getItem('comm_assess_trainee');
            if (saved) {
                try { this.currentTrainee = JSON.parse(saved); } catch (e) {}
            }
        }
        return this.currentTrainee;
    },

    /**
     * Fetch test questions by category and optional set.
     */
    async getQuestions(category, setName = null) {
        try {
            let url = `/api/method/comm_assess.api.get_questions?category=${encodeURIComponent(category)}`;
            if (setName) {
                url += `&set_name=${encodeURIComponent(setName)}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            return { data: data.message || [], error: null };
        } catch (err) {
            console.error('[FrappeDB] getQuestions error:', err);
            return { data: [], error: err.message };
        }
    },

    /**
     * Submit an assessment attempt.
     */
    async submitAssessment({ moduleType, totalScore, maxScore, submissionData, audioUrl, aiFeedback }) {
        const trainee = this.getTrainee();
        if (!trainee || !trainee.emp_id) {
            return { data: null, error: 'No active trainee session found' };
        }

        try {
            const res = await fetch('/api/method/comm_assess.api.submit_assessment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trainee_emp_id: trainee.emp_id,
                    module_type: moduleType,
                    total_score: totalScore,
                    max_score: maxScore,
                    submission_data: submissionData,
                    audio_url: audioUrl,
                    ai_feedback: aiFeedback
                })
            });
            const data = await res.json();
            return { data: data.message, error: null };
        } catch (err) {
            console.error('[FrappeDB] submitAssessment error:', err);
            return { data: null, error: err.message };
        }
    },

    /**
     * Upload an audio blob into Frappe File Manager.
     */
    async uploadAudio(blob, filename = 'recording.webm') {
        try {
            const formData = new FormData();
            formData.append('file', blob, filename);

            const res = await fetch('/api/method/comm_assess.api.upload_audio', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.message && data.message.file_url) {
                return { publicUrl: data.message.file_url, error: null };
            }
            return { publicUrl: null, error: 'Upload failed' };
        } catch (err) {
            console.error('[FrappeDB] uploadAudio error:', err);
            return { publicUrl: null, error: err.message };
        }
    },

    /**
     * Fetch assessments for Admin evaluation.
     */
    async getAdminAssessments(status = null, moduleType = null) {
        try {
            let url = '/api/method/comm_assess.api.get_admin_assessments';
            const params = [];
            if (status) params.push(`status=${encodeURIComponent(status)}`);
            if (moduleType) params.push(`module_type=${encodeURIComponent(moduleType)}`);
            if (params.length) url += '?' + params.join('&');

            const res = await fetch(url);
            const data = await res.json();
            return { data: data.message || [], error: null };
        } catch (err) {
            console.error('[FrappeDB] getAdminAssessments error:', err);
            return { data: [], error: err.message };
        }
    },

    /**
     * Evaluate an assessment (Admin Portal).
     */
    async evaluateAssessment(assessmentId, totalScore, adminFeedback) {
        try {
            const res = await fetch('/api/method/comm_assess.api.evaluate_assessment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assessment_id: assessmentId,
                    total_score: totalScore,
                    admin_feedback: adminFeedback,
                    status: 'Evaluated'
                })
            });
            const data = await res.json();
            return { data: data.message, error: null };
        } catch (err) {
            console.error('[FrappeDB] evaluateAssessment error:', err);
            return { data: null, error: err.message };
        }
    },

    /**
     * Fetch analytics for Manager Dashboard.
     */
    async getManagerAnalytics() {
        try {
            const res = await fetch('/api/method/comm_assess.api.get_manager_analytics');
            const data = await res.json();
            return { data: data.message || {}, error: null };
        } catch (err) {
            console.error('[FrappeDB] getManagerAnalytics error:', err);
            return { data: null, error: err.message };
        }
    }
};
