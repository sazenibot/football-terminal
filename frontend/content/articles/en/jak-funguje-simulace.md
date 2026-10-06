---
title: How the match simulation works
date: 2026-10-06
category: Methodology
excerpt: What the model is based on, what does not go into it and how to tell whether to trust it.
minutes: 5
tier: account
---
The simulation in Match Center answers the question: **how many goals should each team score and with what probability will the match end in a home win, a draw or an away win.**

## The basis: expected goals

For both teams we estimate how many goals they will score in the match. It builds on the team's attacking strength, the opponent's defensive strength and shooting at home or away. At the start of the season it draws mainly on last year's data, and as the season goes on this year's matches take over the weight.

<!-- gate -->

## Adjustments

- **Opponent:** teams are rated by whom they scored against, not just how many goals they scored.
- **Chance quality:** the estimate uses xG over the last six matches, so that one lucky win does not distort the picture.
- **Rest:** a team playing after a break of up to three days has a slightly lower attack and a weaker defence.
- **Promoted teams:** they get the average of the three weakest teams of the previous season until they have their own data.

## From goals to probabilities

Expected goals are converted into a distribution of results (Poisson distribution; the model also has a low-score correction prepared, but tests did not confirm it, so it is switched off). From it we compute win, draw, loss, over and under, the most likely score and other markets.

## What does not go into the model

- **Odds.** The model is independent of bookmakers. The odds are shown next to it so that you can compare the two views.
- **Injuries and line-ups** are not reflected in it. Treat them as additional context.

## How to tell whether to trust it

A model must be tested on matches it has not seen. The Results page has two tests: a backtest, where every match is predicted only from the data before it, and a live ledger of predictions locked before kick-off. What matters is not only the winners called correctly but also **calibration**: when the model says 60%, it should come out at roughly 60%.
