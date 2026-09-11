# M7 latency certification negative controls

This file records the executed failure evidence for
`rpc-latency.e2e.ts`. All runs used real `browser.keys()` events and the
production backends.

## Document-size stability

With `RPC_LATENCY_BREAK_STABILITY=1`, the harness deliberately omitted its
final reset and added one insert. The corpus remainder plus that insert changed
the document from **83,241** to **83,250** UTF-16 units. The stability assertion
failed with exit status 1:

```text
Expected: 83241
Received: 83250
1 failing (15.2s)
```

The restored certification runs reported `startDocLength=83241`,
`endDocLength=83241`, and `sizeDrift=0` for both 500-sample conditions.

## Synchronous RPC delay

Injecting 40 ms at the shared real-keydown capture point raised RPC p95 from
**35.8 ms** to **76.3 ms**, a measured **+40.5 ms**:

```text
RPC_LATENCY_DELAY_CONTROL {"baseline":35.799999952316284,"delayed":76.29999995231628,"rise":40.5}
```

The injected condition also ended at 83,241 units with zero drift.

## Forced CM6 layout

Forcing synchronous layout after each matching CM6 update and before its rAF
performed **2,412.0 ms** of measured layout work over 60 warmup-plus-measured
samples. Fork p95 rose from **41.0 ms** to **108.7 ms** (**+67.7 ms**):

```text
RPC_LATENCY_LAYOUT_CONTROL {"baseline":41,"forced":108.69999992847443,"rise":67.69999992847443,"work":2411.999999642372}
```

## RPC engagement and fork isolation

With RPC connected, the production delegation state was
`active=true`, `handlerAttached=true`, and `keyInterceptActive=true`. A real
`i` key put Neovim in insert mode while the bundled fork's `insertMode`
remained false. A following real `x` key produced `x## Section 0` in Neovim and
the same text returned through the line-event bridge into CM6:

```text
RPC_LATENCY_ENGAGEMENT {"delegation":{"active":true,"handlerAttached":true,"keyInterceptActive":true},"nvimMode":"i","forkInsertMode":false,"markerReachedNeovimAndCm6":true}
```

This marker was reset before timing.

## Restored sanity-gate result

The final N=500, 75-warmup run still failed the blocking sanity gate: fork p95
was **41.0 ms**, while RPC p95 was **35.8 ms**. Therefore the spec stopped with
exit status 1 and did not calculate or publish certification deltas:

```text
RPC_LATENCY_SANITY {"forkP95":41,"rpcP95":35.799999952316284,"passed":false}
Expected: > 41
Received:   35.799999952316284
```
