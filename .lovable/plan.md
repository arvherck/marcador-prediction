## Problem

"Fill test predictions" throws "Something went wrong" (toast).

## Root cause

Identical bug to the multi-user simulation fix: `public.fill_test_predictions(_caller_id uuid)` declares `pick_id uuid`, but `predictions.id` is `integer`. The per-matchday booster `SELECT p.id INTO pick_id` raises `22P02 invalid input syntax for type uuid` and the RPC aborts.

A search confirms this is the only remaining function with the wrong type.

## Fix

Single migration: redefine `public.fill_test_predictions` with `pick_id integer` (body otherwise unchanged).

## Verification

1. Reload Admin → Tests.
2. Click "Fill test predictions" — expect `✓ N predictions created for admin`.
3. No new 22P02 errors in worker logs.