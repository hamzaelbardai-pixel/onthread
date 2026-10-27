# OnThread live evaluation

Date: 2026-10-26 · Claude Code 2.1.308 (Claude Code) · 13/13 scenarios as expected.
Plugin: this checkout (OnThread 0.1.3) via --plugin-dir; any installed copy switched off for the run.
Fictional conversations (tests/eval/scenarios.json). The classifier is a simple heuristic; replies are shown in full so you can judge them yourself. Environment variable names that look like credentials are shown as <ENV_VAR>.

| Scenario | Expected | Result |
|---|---|---|
| B9-coherent | proceed | as expected |
| B10-subtopic | proceed | as expected |
| B11-general-question | proceed | as expected |
| B12-natural-evolution | proceed | as expected |
| B13-confusion | ask | as expected |
| B14-new-subject | ask | as expected |
| B15-ambiguous | proceed | as expected |
| B16-voluntary-switch | proceed | as expected |
| B17-after-exception | proceed | as expected |
| B17b-continue-here-flow | flow | as expected (question recorded: "Intégration Stripe"; accepted after "Oui, continue ici.": "Intégration Stripe") |
| C25-english-confusion | ask | as expected |
| C26-mixed-languages | ask | as expected |
| A-first-message-topic | topic | as expected (recorded topic: "Programme de fidélité à points clients") |

## B9-coherent

```text
Je ne peux pas encore ajouter les remboursements partiels : le dépôt `shop` est vide. Il ne contient aucun fichier, même caché, et aucun commit. Il n'y a donc aucune intégration Stripe existante à étendre.

De plus, je n'ai accès dans cette session qu'à des outils de lecture et de recherche. Je ne peux pas créer ni modifier de fichiers.

Pour avancer, j'ai besoin de savoir :

1. **Où se trouve le code ?** Il est peut-être dans un autre dossier ou sur une autre branche (on est actuellement sur un `HEAD` sans commit). Si c'est le cas, indique-moi le chemin.
2. **Quelle stack ?** Par exemple Node/Express, Next.js, Python/Django, Laravel. Je pourrai alors te proposer le code à intégrer.

Voici comment fonctionne un remboursement partiel avec Stripe :
- **Appel API :** `stripe.refunds.create({ payment_intent: 'pi_...', amount: 1500 })`. Le montant est en centimes et ne doit pas dépasser ce qui reste remboursable.
- **Contrôle côté serveur :** calculer ce qui reste remboursable (`amount_received - amount_refunded`) avant d'appeler Stripe.
- **Idempotence :** envoyer une clé `idempotencyKey` pour éviter de rembourser deux fois.
- **Webhooks :** écouter `charge.refunded` et `refund.updated` pour mettre à jour le statut de la commande (`partially_refunded` ou `refunded`).
- **Base de données :** une table `refunds` (commande, montant, raison, id Stripe, statut) pour garder un historique de plusieurs remboursements sur une même commande.

Si tu me donnes la stack, je te fournis le code
```

## B10-subtopic

```text
Le dépôt `shop` est vide pour l'instant : aucun fichier n'est suivi. Je ne peux donc pas me baser sur ton code. Voici la structure que je recommande. Elle convient à n'importe quelle stack, et les exemples sont en TypeScript/Express.

## 1. Un format de réponse d'erreur unique

Toutes les erreurs doivent sortir avec la même forme. La norme **RFC 9457 (Problem Details)** est un bon point de départ :

```json
{
  "type": "https://shop.example/errors/out-of-stock",
  "title": "Produit en rupture de stock",
  "status": 409,
  "code": "OUT_OF_STOCK",
  "detail": "Le produit 42 n'a plus que 0 unité disponible.",
  "errors": [{ "field": "quantity", "message": "doit être ≤ 0" }],
  "traceId": "a1b2c3"
}
```

- `code` est un identifiant stable que le front peut tester. Ne lui fais jamais tester le texte du message.
- `traceId` permet de retrouver l'erreur dans les logs.

## 2. Une hiérarchie d'erreurs métier

```ts
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) { super(message); }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, "NOT_FOUND", `${resource} ${id} introuvable`);
  }
}
export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(422, "VALIDATION_FAILED", "Données invalides", details);
  }
}
// UnauthorizedError (401), ForbiddenError (403), ConflictError (409)...
```

Les 
```

## B11-general-question

```text
Un **CRM** (*Customer Relationship Management*, ou gestion de la relation client) est un outil, en général un logiciel, qui centralise tout ce qu'une entreprise sait sur ses clients et prospects, et ce qu'elle fait avec eux.

**À quoi ça sert :**
- **Centraliser les contacts** : coordonnées, entreprise, historique des échanges (emails, appels, rendez-vous).
- **Suivre les ventes** : pipeline commercial, opportunités, devis, étapes de conversion.
- **Automatiser le marketing** : campagnes email, segmentation, relances automatiques.
- **Gérer le service client** : tickets, réclamations, suivi des demandes.
- **Analyser** : tableaux de bord, taux de conversion, valeur client, prévisions de ventes.

**Exemples connus :** Salesforce, HubSpot, Zoho CRM, Pipedrive, Odoo.

**Dans un e-commerce**, un CRM sert par exemple à relier les commandes à chaque client, à relancer les paniers abandonnés, à segmenter les clients (fidèles, inactifs, gros acheteurs…) et à personnaliser les offres.

Côté backend, on peut l'intégrer par API (synchroniser les clients et les commandes vers HubSpot, par exemple) ou construire un mini-CRM maison dans la base de données du site.
```

## B12-natural-evolution

```text
Je n'ai rien pu modifier : le dépôt `shop` ne contient encore aucun fichier (pas de code Stripe, pas de webhook). De plus, dans cette session je n'ai que des outils de lecture, donc je ne peux pas créer de fichiers moi-même.

Voici comment je ferais, en supposant une stack Node/Express :

**Principe :** envoyer l'email depuis le webhook Stripe, à la réception de `checkout.session.completed` (ou `payment_intent.succeeded`). Il vaut mieux éviter de l'envoyer depuis la page de succès côté client, qui peut ne jamais se charger.

```js
// routes/stripeWebhook.js
import express from "express";
import Stripe from "stripe";
import { sendPaymentConfirmation } from "../services/email.js";

const stripe = new Stripe(process.env.<ENV_VAR>);
const router = express.Router();

router.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.<ENV_VAR>
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid") {
      // Idempotence : Stripe peut renvoyer le même événement
      if (!(await alreadyProcessed(event.id))) {
        await sendPaymentConfirmation({
          to: session.customer_details.email,
          amount: session.amount
```

## B13-confusion

```text
Cette demande correspond plutôt à ta conversation « Intégration Stripe » (paiements, webhooks, remboursements). Ici, le sujet est le marketing e-commerce. On continue ici quand même ?

🧭 OnThread · question : Intégration Stripe
```

## B14-new-subject

```text
Cette conversation porte sur le design du dashboard et des pages produit de la boutique. Un outil de gestion RH est un sujet à part, mieux vaut ouvrir une nouvelle conversation dédiée. On continue quand même ici ?

🧭 OnThread · question : Outil de gestion RH
```

## B15-ambiguous

```text
Je n'ai rien modifié : le dépôt `shop` ne contient aucun fichier suivi, donc je n'ai pas trouvé de page des tarifs.

Pour avancer, j'ai besoin de savoir :
1. **Où se trouve la page ?** Un autre dossier ou dépôt, une autre branche (on est actuellement en HEAD détaché), ou un CMS externe ?
2. **Quel texte faut-il changer ?** Par exemple de nouveaux prix, des noms d'offres, une accroche marketing ou des appels à l'action. Si c'est une réécriture marketing, dis-moi le ton voulu et la cible.

Si la page n'existe pas encore, je peux aussi rédiger le texte de zéro. Indique-moi les offres et les prix.
```

## B16-voluntary-switch

```text
Le dépôt `shop` est vide pour l'instant, donc je ne peux pas me caler sur un framework existant. Voici une proposition en **Node.js + Express**, que je peux adapter à une autre stack si besoin.

**`src/routes/health.js`**
```js
const express = require('express');

const router = express.Router();
const startedAt = Date.now();

router.get('/health', async (req, res) => {
  const checks = {};

  // Exemple de vérification de dépendance (à brancher sur la vraie DB)
  // try {
  //   await db.query('SELECT 1');
  //   checks.database = 'ok';
  // } catch (err) {
  //   checks.database = 'error';
  // }

  const healthy = Object.values(checks).every((status) => status === 'ok');

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || 'dev',
    checks,
  });
});

module.exports = router;
```

**`src/app.js`**
```js
const express = require('express');
const healthRouter = require('./routes/health');

const app = express();
app.use(healthRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on port ${port}`));
```

**Comportement :**
- Il renvoie **200** avec `status: "ok"` quand tout va bien, et **503** quand une vérification échoue. Les load balancers et Kubernetes s'appuient sur ce code HTTP.
- `checks` est prévu pour ajouter la base de données, Redis, etc. Tant qu'aucune v
```

## B17-after-exception

```text
Je n'ai pas pu corriger le webhook : le dépôt `shop` ne contient aucun fichier suivi. Il n'y a ni code, ni handler de webhook, ni rien qui mentionne Stripe ou les remboursements (`refund`, `webhook`, `rembours`), et le dépôt n'a aucun commit.

Le code du webhook doit donc être ailleurs. Il est peut-être dans un autre dossier ou une autre branche, ou il n'a pas encore été poussé ici. Pour avancer, envoie-moi l'un de ces éléments :
- le chemin du fichier ou du dossier qui contient le handler du webhook,
- ou le code directement ici,
- et l'erreur que tu vois : signature invalide, événement `charge.refunded` ou `refund.updated` ignoré, double traitement, statut de commande non mis à jour, etc.
```

## B17b-continue-here-flow

```text
Cette demande concerne plutôt ta conversation « Intégration Stripe », pas le marketing. Tu veux que je la traite quand même ici ?

🧭 OnThread · question : Intégration Stripe

--- user: Oui, continue ici. ---

Je n'ai rien pu corriger : le dépôt `shop` est vide. Aucun fichier n'y est suivi et aucune occurrence de « stripe » n'apparaît nulle part. Il n'y a donc pas de code de paiement ou de webhook à examiner.

Pour avancer, il me faudrait :
1. **L'emplacement du code** : est-il dans un autre dossier ou une autre branche ? Le dépôt est actuellement en HEAD détaché, sans aucun commit.
2. **Le symptôme exact** : des paiements réussis dans Stripe mais pas mis à jour dans ta base ? Des webhooks en échec ou reçus en double ? Des statuts qui ne correspondent pas ? Un message d'erreur ou un extrait de log m'aiderait beaucoup.

Dès que j'ai le code, je m'en occupe.

🧭 OnThread · exception : Intégration Stripe
```

## C25-english-confusion

```text
This looks like it belongs in your "Stripe integration" conversation, which covers Stripe payments and webhooks. This one is about marketing strategy. Do you want me to go ahead here anyway?

🧭 OnThread · question : Stripe integration
```

## C26-mixed-languages

```text
Cette demande correspond plutôt à ta conversation « Stripe integration », qui porte sur les paiements, les webhooks et les remboursements Stripe. On continue ici quand même ?

🧭 OnThread · question : Stripe integration
```

## A-first-message-topic

```text
Le dépôt `shop` est vide pour l'instant : il n'y a ni code ni fichier, donc je n'ai pas de stack existante sur laquelle me caler. Avant d'écrire du code, voici ce que je propose et ce qu'il me faut savoir.

## Conception recommandée (simple et solide)

**Principe** : les points sont stockés dans un **historique de mouvements**, pas dans un simple compteur. Le solde est la somme des mouvements. On peut ainsi auditer, annuler et faire expirer les points proprement.

**Modèle de données :**
- `loyalty_accounts` : client, solde mis en cache, niveau éventuel (Bronze/Argent/Or)
- `loyalty_transactions` : client, type (`earn`, `redeem`, `expire`, `adjust`, `reversal`), points (+/−), référence de commande, date d'expiration, date de création

**Règles de base :**
- **Gain** : par exemple 1 point par euro dépensé, calculé sur le montant payé hors frais de port, et crédité **une fois la commande payée** (ou livrée, pour limiter la fraude)
- **Utilisation** : par exemple 100 points = 5 € de réduction au paiement, avec un seuil minimum
- **Remboursement** : on retire les points gagnés sur la commande et on rend ceux qui avaient été utilisés
- **Expiration** : par exemple 12 mois après le gain, gérée par une tâche planifiée

Si vous utilisez Stripe, le crédit des points se branche naturellement sur le webhook `payment_intent.succeeded`, et le retrait sur `charge.refunded`.

## Questions avant de coder

1. **Stack** : quel langage et quel framework (Node/Express, Django, Laravel…) ? Quelle
```
