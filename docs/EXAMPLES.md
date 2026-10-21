# Examples

Every reply below is **real Claude output**, copied from the live evaluation in [EVAL-RESULTS.md](EVAL-RESULTS.md) (Claude Code 2.1.299, fictional conversations). They were not edited.

## A request that belongs to another conversation

Conversation: **Marketing e-commerce**. Another conversation in the same project: **Intégration Stripe**.

> **You:** Corrige le problème de synchronisation des paiements Stripe.
>
> **Claude:** Cette demande ressemble plutôt à ta conversation « Intégration Stripe », qui porte sur les paiements, les webhooks et les remboursements. On continue ici quand même ?

The same in English:

> **You:** Fix the Stripe webhook signature verification bug.
>
> **Claude:** This request looks like it belongs in your **"Stripe integration"** conversation (Stripe payments, webhooks and refunds). This one is about marketing strategy. Do you want me to go ahead here anyway?

With mixed languages:

> **You:** Peux-tu fix le bug du webhook Stripe stp ?
>
> **Claude:** Cette demande ressemble plutôt à ta conversation « Stripe integration » (paiements, webhooks et remboursements Stripe). Ici, on parle de marketing. Tu veux qu'on continue ici quand même ?

## A new subject with no matching conversation

Conversation: **Design UX/UI**.

> **You:** Je veux développer un outil de gestion des ressources humaines pour mon entreprise.
>
> **Claude:** Cette demande (un outil RH) n'a pas grand-chose à voir avec cette conversation, qui porte sur le design du dashboard et des pages produit. Aucune de tes autres conversations ne correspond non plus. Tu préfères l'ouvrir dans une nouvelle conversation dédiée, ou on continue ici quand même ?

## No interruption

In each of these, Claude answered or started working directly, with no OnThread question:

| Conversation | Request | Why it passes |
|---|---|---|
| Intégration Stripe | *Ajoute la prise en charge des remboursements partiels.* | Same field. |
| Développement backend | *Comment devrait-on structurer la gestion des erreurs de l'API ?* | Sub-topic. |
| Développement backend | *Peux-tu m'expliquer rapidement ce qu'est un CRM ?* | General question, not a task. |
| Intégration Stripe | *Il faudrait aussi envoyer un email de confirmation après chaque paiement réussi.* | Natural evolution. |
| Marketing e-commerce | *Mets à jour le texte de la page des tarifs.* | Ambiguous, so no interruption. |
| Marketing e-commerce | *Je sais qu'on est dans la discussion marketing, mais je veux maintenant travailler sur le backend ici : …* | Explicit choice. |
| Marketing e-commerce, after answering "continue here" about Stripe once | *Corrige aussi le webhook Stripe des remboursements.* | Already accepted. |

## The topic line

On the first real request of a new conversation, Claude ends its answer with a line such as:

```text
🧭 OnThread · sujet : Programme de fidélité à points clients
```

OnThread stored exactly that text as the conversation's topic in the evaluation run. You can change it at any time with `/onthread:topic <new topic>`.

## After you answer "continue here"

Claude does the task and ends with, for example:

```text
🧭 OnThread · exception : Stripe
```

From then on, Stripe requests in this conversation pass without a question.
