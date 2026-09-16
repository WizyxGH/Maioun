-- ---------------------------------------------------------------------------
-- OÙ UNE SOURCE EN ÉTAIT RESTÉE.
--
-- `source_state` dit comment le dernier passage s'est passé ; rien ne disait où
-- il s'était arrêté. Une source qui lit un flux ordonné — une boîte aux lettres,
-- un journal — devait donc tout relire à chaque fois pour retrouver le neuf.
--
-- Mesuré le 2026-09-16 sur les alertes e-mail : 12 161 messages téléchargés en
-- quatorze jours alors que la boîte n'en a reçu que 140. Chaque passage relisait
-- la même fenêtre de quatre jours.
--
-- Le contenu est OPAQUE au cœur : seule la source l'écrit et le relit
-- (`ScrapeResult.memo` → `ScrapeContext.memo`). Ne rien y mettre de secret : la
-- table est lue par les écrans d'audit.
-- ---------------------------------------------------------------------------

ALTER TABLE source_state ADD COLUMN memo TEXT;
