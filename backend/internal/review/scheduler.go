// Package review holds the spaced-repetition scheduler.
//
// Deterministic SM-2 variant (Wozniak): a rating maps to quality q in 1..5
// (Again=1, Hard=3, Good=4, Easy=5). q<3 is a lapse — the item re-enters at a
// 1-day interval and its ease decays; q>=3 grows the interval by the ease
// factor (Hard grows slower, capped at 1.2x). Pure functions: all wall-clock
// input is passed in so behaviour is pinned by unit tests.
package review

import (
	"math"
	"time"
)

// Rating submitted from the review UI.
const (
	RatingAgain = 1
	RatingHard  = 2
	RatingGood  = 3
	RatingEasy  = 4
)

const (
	InitialEase  = 2.5
	MinEase      = 1.3
	MaxInterval  = 365
	FirstInterval = 1
	SecondInterval = 6
	// Hard reviews grow the interval by a fixed dampened factor instead of
	// the ease factor, so repeatedly "hard" items don't explode their gaps.
	HardFactor   = 1.2
)

// quality maps the 4-button rating onto the SM-2 quality scale (0..5).
func quality(rating int) float64 {
	switch rating {
	case RatingAgain:
		return 1
	case RatingHard:
		return 3
	case RatingGood:
		return 4
	case RatingEasy:
		return 5
	default:
		return 0
	}
}

// State is the schedule kept per (user, item).
type State struct {
	IntervalDays int
	Ease         float64
	ReviewCount  int
}

// NewState returns the untouched queue entry.
func NewState() State {
	return State{IntervalDays: 0, Ease: InitialEase, ReviewCount: 0}
}

// Next computes the schedule after a rating. The returned State's DueAt
// anchor is `now + IntervalDays` handled by the caller.
func Next(state State, rating int) State {
	q := quality(rating)

	ease := state.Ease + (0.1 - (5-q)*(0.08+(5-q)*0.02))
	if ease < MinEase {
		ease = MinEase
	}

	next := State{Ease: roundEase(ease)}
	if q < 3 {
		// Lapse: restart the interval ladder but keep the decayed ease.
		next.IntervalDays = FirstInterval
		next.ReviewCount = 0
		return next
	}

	next.ReviewCount = state.ReviewCount + 1
	switch {
	case state.ReviewCount == 0:
		next.IntervalDays = FirstInterval
	case state.ReviewCount == 1:
		next.IntervalDays = SecondInterval
	case rating == RatingHard:
		next.IntervalDays = grow(state.IntervalDays, HardFactor)
	default:
		next.IntervalDays = grow(state.IntervalDays, ease)
	}
	return next
}

func grow(interval int, factor float64) int {
	next := int(math.Round(float64(interval) * factor))
	if next < FirstInterval {
		return FirstInterval
	}
	if next > MaxInterval {
		return MaxInterval
	}
	return next
}

func roundEase(ease float64) float64 {
	return math.Round(ease*100) / 100
}

// DueAt converts a State into the absolute next-review timestamp.
func DueAt(next State, now time.Time) time.Time {
	return now.Add(time.Duration(next.IntervalDays) * 24 * time.Hour)
}
