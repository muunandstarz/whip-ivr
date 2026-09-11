# Production Verification Notes

## 2026-09-11 Settlement Demand repair

- The development preview at `https://3000-i8k4qwo8obmufyrumd8lt-56528006.us1.manus.computer/doc-generator?tab=tl-settlement` displayed the repaired Total Loss form, including the new ACV, storage, admin-fee, sales-tax, and salvage fields, the **Clear Form** button, and an in-place formatted PDF preview.
- After checkpoint `828d040d`, the custom domain `https://whipclaimsivr.com/doc-generator?tab=tl-settlement&release=828d040d` still returned the prior Total Loss form without the new fields or Clear Form control. This is a deployed artifact/cache discrepancy requiring verification against the project domain and published bundle before calling the repair live on the custom domain.
