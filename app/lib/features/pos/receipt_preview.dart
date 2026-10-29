// معاينة الإيصال (نفس الصورة اللي تنطبع) + طباعة + مشاركة PDF

import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../app/controller.dart';
import '../../printing/receipt.dart';
import '../../ui/widgets.dart';

Future<void> showReceiptPreview(BuildContext context, ReceiptDoc doc) => showDialog<void>(
      context: context,
      builder: (_) => _ReceiptPreview(doc: doc),
    );

class _ReceiptPreview extends StatefulWidget {
  const _ReceiptPreview({required this.doc});
  final ReceiptDoc doc;
  @override
  State<_ReceiptPreview> createState() => _ReceiptPreviewState();
}

class _ReceiptPreviewState extends State<_ReceiptPreview> {
  Uint8List? _png;
  bool _printing = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_png == null) _render();
  }

  Future<void> _render() async {
    final app = Services.read(context);
    final png = await app.printer.receiptPng(widget.doc, app.catalog.seller);
    if (mounted) setState(() => _png = png);
  }

  Future<void> _print() async {
    final app = Services.read(context);
    setState(() => _printing = true);
    final err = await app.printer.printReceipt(widget.doc, app.catalog.seller);
    if (!mounted) return;
    setState(() => _printing = false);
    showSnack(context, err ?? 'تم الإرسال للطابعة', error: err != null);
  }

  @override
  Widget build(BuildContext context) {
    final app = Services.of(context);
    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420, maxHeight: 760),
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
            child: Row(children: [
              Expanded(child: Text(widget.doc.number, textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w900))),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close_rounded)),
            ]),
          ),
          Expanded(
            child: Container(
              color: const Color(0xFFEDEBE6),
              alignment: Alignment.topCenter,
              child: _png == null
                  ? const Center(child: CircularProgressIndicator())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(14),
                      child: DecoratedBox(
                        decoration: BoxDecoration(boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 12)]),
                        child: Image.memory(_png!, width: 320, filterQuality: FilterQuality.medium),
                      ),
                    ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => app.printer.share(widget.doc, app.catalog.seller),
                  icon: const Icon(Icons.ios_share_rounded),
                  label: const Text('مشاركة PDF'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: BusyButton(label: 'طباعة', icon: Icons.print_rounded, busy: _printing, onPressed: _print)),
            ]),
          ),
        ]),
      ),
    );
  }
}
