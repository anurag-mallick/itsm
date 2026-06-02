from rest_framework import serializers
from .models import User, Role


class RoleSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source='get_name_display', read_only=True)

    class Meta:
        model = Role
        fields = ['id', 'name', 'display_name']


class UserSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True, allow_null=True)
    role_display = serializers.CharField(source='role.get_name_display', read_only=True, allow_null=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'role_name', 'role_display',
            'account_type', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10)

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'role', 'account_type', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=10)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()
