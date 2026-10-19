# Demo data

Everything in this folder is fictional and exists only to demonstrate Atlas.

* `docs/`: internal documents of *Nexa Digital*, an invented web agency.
* `nexa-gestion/`: a small management app for that agency.

**The demo app contains deliberate flaws** so that Atlas has something real to find when it compares the code with the company's own policies: a credential written in the configuration file (a placeholder, not a real password), a weaker password-hashing cost than the policy requires, a query built by string concatenation, a reminder delay that contradicts the billing procedure, and a missing GDPR purge job. This code is never deployed and must not be reused.

`scripts/build_demo.py` bundles this folder into `public/data/` for the browser.
