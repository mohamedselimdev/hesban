# Code signing and distribution (W1-12)

Status: **investigation complete, no purchase made, nothing published.** Recommendation below needs owner confirmation; the method is not final until a certificate authority confirms in writing that it can validate the owner's Egyptian identity (see "Open questions").
Date: 2026-11-01. Evidence level is marked on every claim: **[official]** Microsoft/primary text read via search result, **[secondary]** vendor, reseller or community page, **[unverified]** not confirmed by any source found.

## Options compared

| | A. Microsoft Store (MSIX, Store-signed) | B. External signed EXE installer (NSIS, OV certificate) | C. External signed MSIX (sideload / App Installer) | D. Azure Artifact Signing (formerly Trusted Signing) |
|---|---|---|---|---|
| Who signs | Microsoft, after certification | Us, with an OV code-signing certificate | Us, certificate must be trusted on each PC | Us, certificate issued by Microsoft's service |
| Cost (indicative) | Developer account: Egypt is listed as a supported market with a 133 EGP individual fee [official, older table]; Microsoft announced free individual registration on 2025-09-10 [official], but whether the free flow applies in Egypt could not be confirmed [unverified]. Company accounts: one-time fee noted as $99 [official sign-up page]. | OV certificates about $129–440 per year depending on CA and delivery [secondary, reseller pages; not official price lists]. Validity now capped around 460 days, so yearly renewal [secondary]. | Same certificate cost as B, plus the work of distributing trust | From $9.99 per month [secondary] |
| Egypt eligibility | Registration market supported [official, older table]. | Depends on the CA's identity validation for an Egyptian individual or company [unverified for every CA]. | Same as B. | **Not eligible as far as found:** public-trust certificates are for organizations in the USA, Canada, EU and UK, and individuals in the USA and Canada only [official quickstart]. An Egyptian individual or company does not qualify. |
| Installer experience | Install from the Store: needs internet, a Microsoft account and an enabled Store on the shop PC; no SmartScreen warning for Store installs [secondary]. Not usable for offline USB installation by a technician. | Familiar setup wizard; works offline from a USB stick; SmartScreen reputation builds gradually with an OV certificate, and claims that EV gives instant reputation are disputed and may be outdated [secondary, conflicting]. | Needs the signing certificate trusted on every PC or a public-CA certificate; App Installer flow is unfamiliar to shop owners. | Same as B once signed. |
| Updates | Store updates automatically, on Microsoft's schedule; a schema migration may run on first launch after an update without a technician present; update timing is not under our control. | Manual installer updates in v1 (ADR-014), under our control; auto-update can be added later. | Electron's built-in updater can handle MSIX via a JSON endpoint [official Electron docs, via search]; `electron-builder` MSIX target is **beta** and new [official docs, via search]. | Same as B. |
| Licensing compatibility (offline signed licence, ADR-012) | **Unverified.** Store policy on selling or licensing a subscription outside Microsoft's commerce system could not be confirmed [unverified]; policy review needed before choosing. | Fully compatible. | Compatible. | Compatible. |
| Data safety | MSIX gives the app a package identity; per-user AppData writes can be redirected into the package, and uninstalling can remove that data [unverified here, standard MSIX behaviour must be checked]. Conflicts with the rule that data must survive reinstall and licence changes unless the database lives outside the package. | Data in a normal folder survives uninstall if the installer is configured so. | Same concern as A. | Same as B. |
| Build maturity in our toolchain | `electron-builder` MSIX target is beta [official docs, via search]. | `electron-builder` NSIS is mature; Fuses and ASAR integrity already planned. | Beta tooling. | Needs an eligible account (see above). |
| Review/publication delay | Certification review before every release. | None. | None. | None. |

## Egypt-specific points

- Microsoft's account page lists Egypt as a supported registration country for Store developer accounts [official, older table]; the individual fee there was 133 EGP and a company fee 600 EGP. A later announcement removed the individual fee, with caveats that the free flow applies only in flighted markets [official]. Check the live Partner Center page before relying on either figure.
- Azure Artifact Signing public-trust eligibility excludes Egypt for both individuals and organizations (list above) [official quickstart]. Using a foreign entity only to obtain eligibility is not recommended.
- Certificate authorities do not publish a country list in the sources found. Each CA must be asked, in writing, whether it validates an Egyptian individual (national ID, possibly notarised) or a registered Egyptian business, what documents it needs, and how it delivers the hardware-protected key (token shipped to Egypt, cloud signing, or HSM) [unverified].
- Since 2023 private keys for OV and EV code-signing certificates must live in certified hardware or a cloud signing service [secondary, several vendors; CA/B Forum baseline text not read]. A shipped USB token needs customs lead time; a cloud service avoids it but adds a monthly fee.

## Recommendation

**Primary: Option B — externally distributed NSIS installer signed with an OV code-signing certificate, key held in a cloud signing service or hardware token.**

Why: it is the only option that satisfies all of these together: offline USB installation by a technician at a shop, our own offline licence (ADR-012), manual updates timed with backups (ADR-014, ADR-010), mature tooling (NSIS, Fuses, ASAR integrity), no certification delay, and no Store account or internet requirement on the shop PC. Cost is a yearly certificate fee plus a validation process whose Egyptian feasibility is still unconfirmed.

**Not chosen now:**
- **A (Store/MSIX):** reconsider as an optional second channel after v1 if (a) the Store licensing policy is checked and compatible, (b) the data location problem is solved, (c) the electron-builder MSIX target leaves beta. Installation needs internet and a Microsoft account, which conflicts with the offline, technician-installed shop scenario.
- **C:** all the tooling risk of A plus certificate trust distribution; no advantage over B for our customers.
- **D:** ineligible for an Egyptian individual or company as far as found.

**Interim (before any certificate exists):** developer and test builds are unsigned and run only on the developer's machines and VMs. A pilot installation at a shop would show a SmartScreen "unknown publisher" prompt and possibly antivirus warnings; the developer performs that installation in person and explains the prompt, or the pilot waits for a signed build. A self-signed certificate is not used for customers (ADR-020).

## Decision steps (owner actions; nothing bought by this project)

1. By end of Week 2, send written questions to at least three CAs or resellers (for example the ones named in the sources below): Egyptian individual or company validation, documents, price per year, validity (about 460 days?), key delivery (token to Egypt vs cloud signing), CI signing support, renewal and revocation process. Record answers in this file.
2. Confirm the owner's legal status for validation: individual vs registered business (commercial register, tax card). This decides which validation path applies [open question].
3. Pick the CA; the owner purchases it personally. Store the key only in the token or cloud service, never in the repository or CI secrets in plain form.
4. Integrate signing into the release pipeline in Week 14 (electron-builder `afterSign`/signing hook), then verify: `signtool verify /pa`, installer on a clean Windows 11 VM, SmartScreen behaviour recorded.
5. Re-evaluate Option A after v1 using the three conditions above.

## Open questions

- Is the owner's business registered (commercial register and tax card) or sole individual?
- Which CAs accept Egyptian identity documents, and what do they cost for individuals vs businesses?
- Does the Microsoft Store allow a Store-distributed app to verify an offline vendor-signed licence and sell the subscription outside Microsoft commerce? (Not verified.)
- Where does a Store-packaged Electron app keep an SQLite database so that uninstall does not delete it? (Not verified.)
- Does the Partner Center free individual registration apply to Egypt today? (Not verified.)

## Sources

- [Microsoft: Account types, locations, and fees](https://learn.microsoft.com/windows/uwp/publish/account-types-locations-and-fees)
- [Windows Developer Blog: free individual registration (2025-09-10)](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)
- [Microsoft: Partner Center sign-up](https://learn.microsoft.com/en-us/windows/apps/get-started/sign-up)
- [Microsoft: Artifact Signing quickstart (eligibility)](https://learn.microsoft.com/azure/artifact-signing/quickstart)
- [Microsoft: Artifact Signing FAQ](https://learn.microsoft.com/en-us/azure/artifact-signing/faq)
- [electron-builder: MSIX target (beta)](https://www.electron.build/docs/msix/)
- [Electron: autoUpdater (MSIX update support)](https://az.electronjs.org/pt/docs/latest/api/auto-updater)
- [Microsoft Store Policies](https://learn.microsoft.com/windows/uwp/publish/store-policies) (policy text on external licensing was not read; verify before choosing Option A)
- Secondary (vendor, reseller and community pages used only for indicative prices and hardware-key rule): [Encryption Consulting](https://www.encryptionconsulting.com/education-center/what-is-a-code-signing-certificate/), [GeoCerts](https://www.geocerts.com/docs/code-signing/), [SSLInsights Sectigo guide](https://sslinsights.com/sectigo-code-signing-certificate-guide/), [SSLInsights DigiCert vs Sectigo](https://sslinsights.com/digicert-vs-sectigo-code-signing/), [SSL.com eSigner pricing](https://www.ssl.com/nl/gids/esigner-prijzen-voor-code-ondertekening/).

Limit: prices and SmartScreen behaviour come from marketing and community pages, some dated 2026 without primary citations. Re-check on the CA's own site and in Microsoft's SmartScreen documentation before spending money.
