-- CP-BOARD-CONFIG01 rollback acceptance on disposable PostgreSQL only.
\set ON_ERROR_STOP on
-- Deletion of test settings is explicitly limited to the disposable CI service.
DELETE FROM public.wm_board_ui_settings;
