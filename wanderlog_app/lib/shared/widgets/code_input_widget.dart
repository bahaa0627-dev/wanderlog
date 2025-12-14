import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:wanderlog/core/theme/app_theme.dart';

class CodeInputWidget extends StatefulWidget {
  const CodeInputWidget({
    super.key,
    required this.length,
    required this.onCompleted,
    this.hasError = false,
  });

  final int length;
  final void Function(String) onCompleted;
  final bool hasError;

  @override
  State<CodeInputWidget> createState() => _CodeInputWidgetState();
}

class _CodeInputWidgetState extends State<CodeInputWidget> {
  late List<TextEditingController> _controllers;
  late List<FocusNode> _focusNodes;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(
      widget.length,
      (index) => TextEditingController(),
    );
    _focusNodes = List.generate(
      widget.length,
      (index) => FocusNode(),
    );

    // Auto focus on first field
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _focusNodes[0].requestFocus();
      }
    });
  }

  @override
  void dispose() {
    for (var controller in _controllers) {
      controller.dispose();
    }
    for (var focusNode in _focusNodes) {
      focusNode.dispose();
    }
    super.dispose();
  }

  void _onChanged(String value, int index) {
    if (value.isNotEmpty) {
      // Move to next field
      if (index < widget.length - 1) {
        _focusNodes[index + 1].requestFocus();
      } else {
        // All fields filled, trigger completion
        _focusNodes[index].unfocus();
        final code = _controllers.map((c) => c.text).join();
        if (code.length == widget.length) {
          widget.onCompleted(code);
        }
      }
    }
  }

  void _onKeyEvent(KeyEvent event, int index) {
    if (event is KeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace) {
      if (_controllers[index].text.isEmpty && index > 0) {
        // Move to previous field and clear it
        _focusNodes[index - 1].requestFocus();
        _controllers[index - 1].clear();
      }
    }
  }

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: List.generate(
          widget.length,
          (index) => _buildCodeField(index),
        ),
      );

  Widget _buildCodeField(int index) => SizedBox(
        width: 48,
        height: 56,
        child: KeyboardListener(
          focusNode: FocusNode(),
          onKeyEvent: (event) => _onKeyEvent(event, index),
          child: TextField(
            controller: _controllers[index],
            focusNode: _focusNodes[index],
            textAlign: TextAlign.center,
            keyboardType: TextInputType.number,
            maxLength: 1,
            style: AppTheme.headlineMedium(context),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
            ],
            decoration: InputDecoration(
              counterText: '',
              contentPadding: EdgeInsets.zero,
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color:
                      widget.hasError ? AppTheme.error : AppTheme.borderYellow,
                  width: 2,
                ),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(
                  color:
                      widget.hasError ? AppTheme.error : AppTheme.borderYellow,
                  width: 2.5,
                ),
              ),
              filled: true,
              fillColor: AppTheme.white,
            ),
            onChanged: (value) => _onChanged(value, index),
          ),
        ),
      );
}
