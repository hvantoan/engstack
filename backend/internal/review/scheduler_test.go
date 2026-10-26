package review

import (
	"testing"
	"time"
)

func TestNextRatingLadder(t *testing.T) {
	// First successful recall: 1d. Second: 6d. Third: interval * ease.
	state := NewState()

	state = Next(state, RatingGood)
	if state.IntervalDays != 1 || state.ReviewCount != 1 || state.Ease != 2.5 {
		t.Fatalf("first good: %+v", state)
	}

	state = Next(state, RatingGood)
	if state.IntervalDays != 6 || state.ReviewCount != 2 || state.Ease != 2.5 {
		t.Fatalf("second good: %+v", state)
	}

	state = Next(state, RatingGood)
	if state.IntervalDays != 15 || state.ReviewCount != 3 || state.Ease != 2.5 {
		t.Fatalf("third good: %+v", state)
	}
}

func TestNextAgainResetsLadder(t *testing.T) {
	state := State{IntervalDays: 30, Ease: 2.5, ReviewCount: 5}
	next := Next(state, RatingAgain)
	if next.IntervalDays != 1 || next.ReviewCount != 0 {
		t.Fatalf("again should reset ladder: %+v", next)
	}
	// SM-2 ease decay for q=1: 2.5 + (0.1 - 4*(0.08+4*0.02)) = 1.96
	if next.Ease != 1.96 {
		t.Fatalf("ease = %v, want 1.96", next.Ease)
	}
}

func TestNextHardDampensGrowth(t *testing.T) {
	state := State{IntervalDays: 30, Ease: 2.5, ReviewCount: 4}
	next := Next(state, RatingHard)
	if next.IntervalDays != 36 { // 30 * 1.2, not 30 * ease
		t.Fatalf("hard interval = %d, want 36", next.IntervalDays)
	}
	if next.Ease != 2.36 { // 2.5 + (0.1 - 2*0.12)
		t.Fatalf("ease = %v, want 2.36", next.Ease)
	}
}

func TestNextEasyBoostsEase(t *testing.T) {
	state := State{IntervalDays: 10, Ease: 2.5, ReviewCount: 3}
	next := Next(state, RatingEasy)
	if next.Ease != 2.6 {
		t.Fatalf("ease = %v, want 2.6", next.Ease)
	}
	if next.IntervalDays != 26 { // round(10 * 2.6)
		t.Fatalf("interval = %d, want 26", next.IntervalDays)
	}
}

func TestEaseFloor(t *testing.T) {
	state := State{IntervalDays: 5, Ease: MinEase, ReviewCount: 2}
	next := Next(state, RatingAgain)
	if next.Ease != MinEase {
		t.Fatalf("ease fell below floor: %v", next.Ease)
	}
}

func TestIntervalCaps(t *testing.T) {
	state := State{IntervalDays: 400, Ease: 3.0, ReviewCount: 10}
	next := Next(state, RatingEasy)
	if next.IntervalDays != MaxInterval {
		t.Fatalf("interval = %d, want cap %d", next.IntervalDays, MaxInterval)
	}
}

func TestDueAtAddsDays(t *testing.T) {
	now := time.Date(2026, 10, 26, 8, 0, 0, 0, time.UTC)
	got := DueAt(State{IntervalDays: 6}, now)
	want := now.Add(6 * 24 * time.Hour)
	if !got.Equal(want) {
		t.Fatalf("dueAt = %v, want %v", got, want)
	}
}
