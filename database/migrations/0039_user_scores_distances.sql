-- ---------------------------------------------------------------------------
-- Scores détaillés et trajets, par compte.
--
-- `listing_user_score` portait les chiffres de chaque compte, mais le DÉTAIL —
-- les raisons (« 950 € ≤ 1 000 € de budget ») et les temps de trajet — restait
-- dans la fiche commune, calculé pour le seul compte principal. Un second
-- compte lisait donc le budget d'un autre, et l'API lui retirait tout trajet
-- plutôt que de lui montrer ceux de quelqu'un d'autre. Chaque compte a
-- désormais les siens, en JSON, à côté de ses chiffres.
-- ---------------------------------------------------------------------------

ALTER TABLE listing_user_score ADD COLUMN scores TEXT;
ALTER TABLE listing_user_score ADD COLUMN distances TEXT;
