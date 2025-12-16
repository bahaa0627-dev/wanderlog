import 'package:json_annotation/json_annotation.dart';

part 'user_model.g.dart';

@JsonSerializable()
class User {

  User({
    required this.id,
    required this.email,
    required this.createdAt, required this.updatedAt, this.name,
    this.avatarUrl,
    this.isEmailVerified,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  final String id;
  final String email;
  final String? name;
  final String? avatarUrl;
  final bool? isEmailVerified;
  final DateTime createdAt;
  final DateTime updatedAt;
  Map<String, dynamic> toJson() => _$UserToJson(this);

  User copyWith({
    String? id,
    String? email,
    String? name,
    String? avatarUrl,
    bool? isEmailVerified,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) => User(
      id: id ?? this.id,
      email: email ?? this.email,
      name: name ?? this.name,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      isEmailVerified: isEmailVerified ?? this.isEmailVerified,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
}






