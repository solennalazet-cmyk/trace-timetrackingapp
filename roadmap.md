# Roadmap

- [x] Restore reliable direct client selection from the assignment drawer in browser and phone app.
- [x] Prevent late timer sync from undoing Pause or Resume and keep the pause-start time visible.
- [x] Prevent assignment data refreshes from resetting or repeatedly reopening the recap.
- [x] Resolve missing billable rates from saved client/project rates or the latest matching billed session.
- [x] Harden report approve/reject and payment recording against double taps and already-reviewed rows.
- [x] Make the Freelancer Reports overview legible and consistent on mobile, with flat input metrics and prominent goals.
- [x] Pin the clock-out assignment box and client picker so they never bounce, with a required automatic check.
- [x] Payments split Step 2: shared splitting rule + tests (src/lib/payment-split.ts).
- [ ] Payments split: wire both payment forms to the shared rule (waiting on user OK, rules differ).
- [ ] Payments split: employer Payments screen ("Paid since 1 Jan", This year / Last year / All time / custom; no tax country/notice), also on employer home.
- [ ] Employer nav: Payments tab 3rd (Home, Calendar, Payments, Freelancers) in BottomNav + DesktopSidebar.
