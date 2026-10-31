# ClaimSaathi single-journey role demo

This is a fictional local simulation. The role tabs share one browser session and are not separate secure accounts. No hospital, insurer, Paytm, or bank is connected. No real approval or payment occurs.

1. On the home page choose **Start the demo**.
2. In Customer, ask: “I need my claim. What document do I need to add?” The assistant explains that the discharge summary is missing and speaks the answer. In Sarvam-connected mode, explicitly enable Sarvam voice consent first to use Sarvam TTS; otherwise the browser device voice is used.
3. Download the separate sample discharge summary, upload it, and share the completed fictional packet with the demo reviewers. The policy, itemised bill, and payment receipt were already seeded.
4. Switch to Hospital and click **Verify sample document received**. The app records a demo-only notification for the next role.
5. Switch to Paytm payout consultant. Explain that Paytm cannot decide an insurance claim and is not connected. Click **Review and submit to simulated insurer**, then **Show simulated approval and payout**.
6. Each role confirmation is spoken aloud and can be replayed with **Listen to notification**. Return to Customer and point out the fictional amount marked as credited. State clearly: “This is only a demo result; no money moved.”

The visible notification list is local demo status, not SMS, email, or push messaging. Sarvam TTS sends response text only after explicit consent; browser voice is the fallback.
